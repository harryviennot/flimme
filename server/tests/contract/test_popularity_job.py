"""The popularity job against the real schema and queue, as flimme_pipeline (M2.9).

The export file is a synthetic `.json.gz` built here and served by a mock transport; nothing
is downloaded. The local database is shared and holds the seed, so every test works with
invented ids (60,000,400 to 60,000,999) and the `restore` fixture removes what it added.
"""

import gzip
import json
from collections.abc import AsyncIterator, Iterable
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.contract.conftest import open_database

from server.catalog.popularity import ExportSource, run_popularity_daily
from server.db.pool import Database

pytestmark = pytest.mark.anyio

FIRST = 60_000_400


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def restore(admin: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    cur = await admin.execute("select coalesce(max(id), 0) from public.ingest_runs")
    row = await cur.fetchone()
    assert row is not None
    last_run = row[0]
    try:
        yield admin
    finally:
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
        await admin.execute("delete from public.titles where tmdb_id between 60000400 and 60000999")


def export_file(entries: Iterable[tuple[int, float]]) -> bytes:
    lines = [
        json.dumps({"adult": False, "id": i, "original_title": f"Invented {i}", "popularity": p})
        for i, p in entries
    ]
    return gzip.compress(("\n".join(lines) + "\n").encode())


def source(entries: Iterable[tuple[int, float]], *, available: bool = True) -> ExportSource:
    body = export_file(entries)

    def handle(request: httpx.Request) -> httpx.Response:
        if available and request.url.path == "/p/exports/movie_ids_11_02_2026.json.gz":
            return httpx.Response(200, content=body)
        return httpx.Response(404)

    return ExportSource(
        transport=httpx.MockTransport(handle), clock=lambda: datetime(2026, 11, 2, 9, tzinfo=UTC)
    )


async def add_title(conn: AsyncConnection, tmdb_id: int, popularity: float) -> None:
    await conn.execute(
        "insert into public.titles (tmdb_id, original_title, popularity)"
        " values (%s, 'Invented', %s)",
        (tmdb_id, popularity),
    )


async def queued(conn: AsyncConnection) -> list[dict[str, Any]]:
    cur = await conn.execute("select message from pgmq.q_catalog_refresh order by msg_id")
    return [row[0] for row in await cur.fetchall()]


async def test_popularity_is_updated_for_films_in_the_catalog(
    database: Database, restore: AsyncConnection
):
    await add_title(restore, FIRST, 1.0)  # in the top
    await add_title(restore, FIRST + 1, 2.0)  # in the file but far outside the top
    await add_title(restore, FIRST + 2, 3.0)  # not in the file at all
    entries = [(FIRST + 10 + i, 500.0 - i) for i in range(5)] + [(FIRST, 600.0), (FIRST + 1, 0.4)]

    await run_popularity_daily(database, source(entries), top_n=3)

    cur = await restore.execute(
        "select tmdb_id, popularity from public.titles where tmdb_id between %s and %s order by 1",
        (FIRST, FIRST + 2),
    )
    assert await cur.fetchall() == [
        (FIRST, pytest.approx(600.0)),
        (FIRST + 1, pytest.approx(0.4)),
        (FIRST + 2, pytest.approx(3.0)),
    ]


async def test_new_top_ids_not_in_the_catalog_are_queued_in_batches_of_at_most_100(
    database: Database, restore: AsyncConnection, admin: AsyncConnection
):
    await add_title(restore, FIRST, 1.0)
    new = [FIRST + 100 + i for i in range(250)]
    entries = [(FIRST, 10_000.0)] + [(i, 5_000.0 - n) for n, i in enumerate(new)]

    await run_popularity_daily(database, source(entries), top_n=1_000)

    messages = await queued(admin)
    assert [len(m["tmdb_ids"]) for m in messages] == [100, 100, 50]
    assert {m["kind"] for m in messages} == {"fetch"}
    assert {m["reason"] for m in messages} == {"candidate"}
    assert [i for m in messages for i in m["tmdb_ids"]] == new  # most popular first
    cur = await restore.execute("select id from public.ingest_runs where kind = 'popularity_daily'")
    (run_id,) = (row[0] for row in await cur.fetchall())
    assert {m["run_id"] for m in messages} == {run_id}


async def test_only_the_top_is_queued_not_every_id_in_the_file(
    database: Database, restore: AsyncConnection, admin: AsyncConnection
):
    entries = [(FIRST + i, 100.0 - i) for i in range(10)]

    await run_popularity_daily(database, source(entries), top_n=4)

    messages = await queued(admin)
    assert [i for m in messages for i in m["tmdb_ids"]] == [FIRST + i for i in range(4)]


async def test_the_run_is_recorded_with_its_counts(database: Database, restore: AsyncConnection):
    await add_title(restore, FIRST, 1.0)
    entries = [(FIRST, 9.0), (FIRST + 1, 8.0)]

    await run_popularity_daily(database, source(entries), top_n=10)

    cur = await restore.execute(
        "select finished_at is not null, errors, note, stats from public.ingest_runs"
        " where kind = 'popularity_daily'"
    )
    (finished, errors, note, stats) = await cur.fetchone()  # type: ignore[misc]
    assert finished and errors == 0
    assert "2026-11-02" in note
    assert stats["popularity_updated"] == 1
    assert stats["candidates_queued"] == 1


async def test_a_missing_export_is_an_error_in_the_run_not_a_retry(
    database: Database, restore: AsyncConnection, admin: AsyncConnection
):
    await run_popularity_daily(database, source([], available=False), top_n=10)

    cur = await restore.execute(
        "select finished_at is not null, errors, note from public.ingest_runs"
        " where kind = 'popularity_daily'"
    )
    (finished, errors, note) = await cur.fetchone()  # type: ignore[misc]
    assert finished and errors == 1 and "export" in note
    assert await queued(admin) == []


async def test_running_it_twice_changes_no_popularity_the_second_time(
    database: Database, restore: AsyncConnection
):
    await add_title(restore, FIRST, 1.0)
    entries = [(FIRST, 9.0)]

    await run_popularity_daily(database, source(entries), top_n=10)
    await run_popularity_daily(database, source(entries), top_n=10)

    cur = await restore.execute(
        "select stats from public.ingest_runs where kind = 'popularity_daily' order by id"
    )
    first, second = (row[0] for row in await cur.fetchall())
    assert first["popularity_updated"] == 1 and second["popularity_updated"] == 0


class CountingDatabase(Database):
    """Counts pool checkouts: the fan-out must not cost one checkout per message."""

    checkouts = 0

    def connection(self):  # type: ignore[no-untyped-def]
        self.checkouts += 1
        return super().connection()


async def test_the_fan_out_takes_a_few_checkouts_whatever_the_number_of_messages(
    database: Database, restore: AsyncConnection, admin: AsyncConnection
):
    # Production (3 Nov): one checkout per message, each queued behind the fetch handlers the
    # job had just fed, took over 30 minutes for 600 messages.
    counting = CountingDatabase(
        database._url,  # noqa: SLF001
        database._pool,  # noqa: SLF001
        database._statement_timeout_s,  # noqa: SLF001
        database._role,  # noqa: SLF001
    )
    await run_popularity_daily(
        counting, source([(FIRST + i, 5_000.0 - i) for i in range(400)]), top_n=1_000
    )
    small = counting.checkouts
    assert len(await queued(admin)) == 4
    await admin.execute("truncate pgmq.q_catalog_refresh")

    counting.checkouts = 0
    await run_popularity_daily(
        counting, source([(FIRST + i, 5_000.0 - i) for i in range(600)]), top_n=1_000
    )
    assert len(await queued(admin)) == 6
    assert counting.checkouts == small


async def test_a_retry_after_a_half_finished_fan_out_queues_each_candidate_once(
    database: Database,
    restore: AsyncConnection,
    admin: AsyncConnection,
    monkeypatch: pytest.MonkeyPatch,
):
    from server.catalog import popularity
    from server.db.contract import enqueue_many

    entries = [(FIRST + i, 5_000.0 - i) for i in range(500)]  # 5 messages
    real = enqueue_many

    async def dies_halfway(conn: AsyncConnection, queue: str, messages: list[Any]) -> None:
        await real(conn, queue, messages[: len(messages) // 2])
        raise RuntimeError("worker killed")

    monkeypatch.setattr(popularity, "enqueue_many", dies_halfway)
    with pytest.raises(RuntimeError):
        await run_popularity_daily(database, source(entries), top_n=1_000)
    assert 0 < len(await queued(admin)) < 5

    monkeypatch.setattr(popularity, "enqueue_many", real)
    await run_popularity_daily(database, source(entries), top_n=1_000)

    ids = [i for m in await queued(admin) for i in m["tmdb_ids"]]
    assert sorted(ids) == [FIRST + i for i in range(500)]
