"""The room_finished queue against the real schema, as flimme_pipeline (M6.8)."""

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.contract.conftest import ADMIN_URL, open_database

from server.db.contract import enqueue
from server.db.payloads import RoomFinishedMessage
from server.db.pool import Database
from server.db.queues import PgmqClient
from server.rooms.finished import make_room_finished_handler
from server.workers.pipeline import ROOM_FINISHED
from server.workers.runner import Delivery, Done, QueueRunner, Reject

pytestmark = pytest.mark.anyio


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def admin_room(
    pipeline_url: SecretStr,
) -> AsyncIterator[tuple[AsyncConnection, uuid.UUID]]:
    """A finished room without a pick, made by the superuser, and an emptied room_finished queue."""
    async with await AsyncConnection.connect(ADMIN_URL, autocommit=True) as conn:
        await conn.execute("truncate pgmq.q_room_finished, pgmq.a_room_finished")
        await conn.execute(
            "insert into public.countries (code) values ('FR') on conflict do nothing"
        )
        cur = await conn.execute(
            "insert into public.rooms (code, mode, state, country, started_at, ended_at,"
            " finale_reason) select '999999', gm.slug, 'done', 'FR', now() - interval '90 seconds',"
            " now(), 'cards' from public.game_modes gm limit 1 returning id"
        )
        row = await cur.fetchone()
        assert row is not None, "no game_modes row: the seed is missing"
        room_id: uuid.UUID = row[0]
        try:
            yield conn, room_id
        finally:
            await conn.execute("delete from public.rooms where id = %s", (room_id,))
            await conn.execute("truncate pgmq.q_room_finished, pgmq.a_room_finished")


async def stats_of(conn: AsyncConnection, room_id: uuid.UUID) -> dict[str, object] | None:
    cur = await conn.execute("select stats from public.rooms where id = %s", (room_id,))
    row = await cur.fetchone()
    assert row is not None
    return row[0]


async def queue_sizes(conn: AsyncConnection) -> tuple[int, int]:
    cur = await conn.execute(
        "select (select count(*) from pgmq.q_room_finished),"
        " (select count(*) from pgmq.a_room_finished)"
    )
    row = await cur.fetchone()
    assert row is not None
    return row[0], row[1]


async def run_until_empty(database: Database, conn: AsyncConnection) -> None:
    runner = QueueRunner(
        ROOM_FINISHED,
        make_room_finished_handler(database),
        PgmqClient(database),
        poll_seconds=1,
        poll_interval_ms=20,
    )
    stop = asyncio.Event()
    task = asyncio.create_task(runner.run(stop))
    for _ in range(200):
        queued, _archived = await queue_sizes(conn)
        if queued == 0:
            break
        await asyncio.sleep(0.05)
    await asyncio.sleep(0.2)
    stop.set()
    await asyncio.wait_for(task, 10)


async def test_a_room_finished_message_writes_the_stats_and_leaves_the_queue(
    database: Database, admin_room: tuple[AsyncConnection, uuid.UUID]
):
    conn, room_id = admin_room
    async with database.connection() as pipeline:
        await enqueue(pipeline, "room_finished", RoomFinishedMessage(room_id=room_id))
    await run_until_empty(database, conn)

    stats = await stats_of(conn, room_id)
    assert stats is not None
    assert stats["outcome"] == "no_pick"
    assert stats["finale_reason"] == "cards"
    assert await queue_sizes(conn) == (0, 0)


async def test_the_same_message_twice_leaves_the_same_stats(
    database: Database, admin_room: tuple[AsyncConnection, uuid.UUID]
):
    conn, room_id = admin_room
    async with database.connection() as pipeline:
        await enqueue(pipeline, "room_finished", RoomFinishedMessage(room_id=room_id))
    await run_until_empty(database, conn)
    first = await stats_of(conn, room_id)
    async with database.connection() as pipeline:
        await enqueue(pipeline, "room_finished", RoomFinishedMessage(room_id=room_id))
    await run_until_empty(database, conn)

    assert first is not None
    assert await stats_of(conn, room_id) == first


async def test_a_message_without_a_room_id_is_rejected_and_a_missing_room_is_done(
    database: Database, admin_room: tuple[AsyncConnection, uuid.UUID]
):
    handler = make_room_finished_handler(database)
    for body in ({}, {"room_id": "not-a-uuid"}):
        outcome = await handler(Delivery(msg_id=1, read_ct=1, body=body))
        assert isinstance(outcome, Reject)
    gone = await handler(Delivery(msg_id=2, read_ct=1, body={"room_id": str(uuid.uuid4())}))
    assert gone == Done()
