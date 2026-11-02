"""The pgmq loop against a real queue, as flimme_pipeline (M2.2)."""

import asyncio
import logging
import os
import signal
from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from pydantic import SecretStr
from tests.contract.conftest import open_database

from server.db.contract import enqueue
from server.db.payloads import CatalogRefreshAdapter, FetchMessage, JobMessage
from server.db.pool import Database
from server.db.queues import PgmqClient
from server.workers.pipeline import make_dispatcher
from server.workers.runner import (
    Delivery,
    Done,
    Handler,
    Outcome,
    QueueRunner,
    QueueSpec,
    install_signal_handlers,
)

pytestmark = pytest.mark.anyio

QUEUE = "catalog_refresh"


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


async def wait_until(predicate: Callable[[], Awaitable[bool]], timeout: float = 10.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if await predicate():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("condition not met in time")


async def count(admin: AsyncConnection, table: str) -> int:
    cur = await admin.execute(f"select count(*) from pgmq.{table}")  # type: ignore[arg-type]
    row = await cur.fetchone()
    assert row is not None
    return row[0]


def has_count(admin: AsyncConnection, table: str, expected: int) -> Callable[[], Awaitable[bool]]:
    async def check() -> bool:
        return await count(admin, table) == expected

    return check


async def send(database: Database, message: JobMessage | FetchMessage) -> None:
    async with database.connection() as conn:
        await enqueue(conn, QUEUE, message)


def runner_for(
    database: Database, handler: Handler, vt_s: int = 300, concurrency: int = 4
) -> QueueRunner:
    spec = QueueSpec(QUEUE, vt_s=vt_s, poison_after=5, concurrency=concurrency)
    return QueueRunner(spec, handler, PgmqClient(database), poll_seconds=1, poll_interval_ms=20)


async def test_a_valid_message_is_handled_once_then_deleted(
    database: Database, admin: AsyncConnection
):
    await send(database, JobMessage(job="reference_weekly"))
    calls: list[Delivery] = []

    async def handler(delivery: Delivery) -> Outcome:
        calls.append(delivery)
        return Done()

    stop = asyncio.Event()
    task = asyncio.create_task(runner_for(database, handler).run(stop))
    await wait_until(has_count(admin, "q_catalog_refresh", 0))
    await asyncio.sleep(0.3)  # a second delivery would show up here
    stop.set()
    await asyncio.wait_for(task, 10)

    assert len(calls) == 1
    assert calls[0].body == {"kind": "job", "job": "reference_weekly"}
    assert await count(admin, "a_catalog_refresh") == 0  # deleted, not archived


async def test_a_failing_handler_leaves_the_message_and_it_comes_back_with_read_ct_plus_one(
    database: Database, admin: AsyncConnection
):
    await send(database, JobMessage(job="changes_daily"))
    seen: list[int] = []

    async def handler(delivery: Delivery) -> Outcome:
        seen.append(delivery.read_ct)
        if len(seen) == 1:
            raise RuntimeError("TMDB hiccup")
        return Done()

    stop = asyncio.Event()
    task = asyncio.create_task(runner_for(database, handler, vt_s=1).run(stop))
    await wait_until(has_count(admin, "q_catalog_refresh", 0))
    stop.set()
    await asyncio.wait_for(task, 10)

    assert seen == [1, 2]


async def test_a_message_read_more_than_five_times_is_archived_without_the_handler(
    database: Database, admin: AsyncConnection, caplog: pytest.LogCaptureFixture
):
    await send(database, JobMessage(job="details_weekly"))
    await admin.execute("update pgmq.q_catalog_refresh set read_ct = 5")  # the next read: 6
    called = False

    async def handler(delivery: Delivery) -> Outcome:
        nonlocal called
        called = True
        return Done()

    stop = asyncio.Event()
    with caplog.at_level(logging.ERROR):
        task = asyncio.create_task(runner_for(database, handler).run(stop))
        await wait_until(has_count(admin, "a_catalog_refresh", 1))
        stop.set()
        await asyncio.wait_for(task, 10)

    assert not called
    assert await count(admin, "q_catalog_refresh") == 0
    assert any(r.levelno == logging.ERROR and "poison" in r.getMessage() for r in caplog.records)


async def test_a_body_that_fails_validation_is_archived_at_once(
    database: Database, admin: AsyncConnection
):
    async with database.connection() as conn:
        await conn.execute(
            "select internal.enqueue(%s, %s)", (QUEUE, Jsonb({"kind": "fetch", "tmdb_ids": []}))
        )

    stop = asyncio.Event()
    task = asyncio.create_task(runner_for(database, make_dispatcher({})).run(stop))
    await wait_until(has_count(admin, "a_catalog_refresh", 1))
    stop.set()
    await asyncio.wait_for(task, 10)

    cur = await admin.execute("select read_ct from pgmq.a_catalog_refresh")
    row = await cur.fetchone()
    assert row is not None and row[0] == 1  # archived on its first read
    assert await count(admin, "q_catalog_refresh") == 0


async def test_a_long_handler_extends_its_timeout_so_the_message_is_not_redelivered(
    database: Database, admin: AsyncConnection
):
    await send(database, JobMessage(job="availability_sweep"))
    calls = 0

    async def handler(delivery: Delivery) -> Outcome:
        nonlocal calls
        calls += 1
        await asyncio.sleep(2.5)  # well over the 1 second timeout
        return Done()

    stop = asyncio.Event()
    task = asyncio.create_task(runner_for(database, handler, vt_s=1).run(stop))
    await wait_until(has_count(admin, "q_catalog_refresh", 0), timeout=15)
    stop.set()
    await asyncio.wait_for(task, 10)

    assert calls == 1


async def test_sigterm_stops_reading_and_the_running_handler_finishes_and_deletes(
    database: Database, admin: AsyncConnection
):
    await send(database, JobMessage(job="details_monthly"))
    started = asyncio.Event()
    release = asyncio.Event()

    async def handler(delivery: Delivery) -> Outcome:
        started.set()
        await release.wait()
        return Done()

    stop = asyncio.Event()
    remove = install_signal_handlers(stop)
    task = asyncio.create_task(runner_for(database, handler, concurrency=1).run(stop))
    try:
        await asyncio.wait_for(started.wait(), 10)
        os.kill(os.getpid(), signal.SIGTERM)
        await asyncio.wait_for(stop.wait(), 5)
        await send(database, JobMessage(job="popularity_daily"))  # arrives after SIGTERM
        await asyncio.sleep(0.5)
        assert not task.done()  # waiting for the handler, not reading
        release.set()
        await asyncio.wait_for(task, 10)
    finally:
        remove()

    cur = await admin.execute("select message->>'job', read_ct from pgmq.q_catalog_refresh")
    assert await cur.fetchall() == [("popularity_daily", 0)]  # first deleted, second unread


async def test_enqueue_sends_json_that_read_returns_unchanged(database: Database):
    message = FetchMessage(run_id=42, tmdb_ids=[60000001, 60000002], reason="candidate")
    await send(database, message)

    client = PgmqClient(database)
    try:
        rows = await client.read(QUEUE, 30, 5, 1, 20)
    finally:
        await client.close()

    assert len(rows) == 1
    body = rows[0].body
    assert body == message.model_dump(mode="json")
    assert body == {
        "kind": "fetch",
        "run_id": 42,
        "tmdb_ids": [60000001, 60000002],
        "reason": "candidate",
    }
    assert CatalogRefreshAdapter.validate_python(body) == message
