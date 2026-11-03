"""The films of a fetch run side by side, and TMDB's limiter is the limit (no database, no network).

TMDB answers after a tiny real sleep; the database is a fake with a small pool. The client's
limiter runs on a fake clock, so only the in-flight limit shows (the 20 a second limit has its
own tests in test_tmdb_client).
"""

import asyncio
import time
from collections import Counter
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest
from tests.conftest import FakeTime, fixture_json

from server.catalog import fetch
from server.catalog.fetch import CONCURRENCY, FetchContext, run_fetch
from server.catalog.tmdb import MAX_IN_FLIGHT, TmdbClient
from server.db.payloads import FetchMessage

pytestmark = pytest.mark.anyio

FIRST = 60_000_600
DELAY = 0.02  # seconds TMDB takes to answer; sequential films would add up


class SlowTmdb(httpx.AsyncBaseTransport):
    """Answers `/movie/<id>` after DELAY: 404 for the ids in `missing`, a full film otherwise."""

    def __init__(self, missing: frozenset[int] = frozenset()) -> None:
        self.missing = missing
        self.in_flight = 0
        self.max_in_flight = 0
        self.requests = 0
        self.tasks_holding_a_connection: set[Any] = set()
        self.asked_while_holding: list[int] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        tmdb_id = int(request.url.path.rsplit("/", 1)[1])
        self.requests += 1
        if asyncio.current_task() in self.tasks_holding_a_connection:
            self.asked_while_holding.append(tmdb_id)
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        try:
            await asyncio.sleep(DELAY)
        finally:
            self.in_flight -= 1
        if tmdb_id in self.missing:
            return httpx.Response(404, json=fixture_json("tmdb/not_found.json"))
        return httpx.Response(200, json=fixture_json("tmdb/movie_full_60000010.json"))


class FakeConnection:
    def __init__(self, database: "FakeDatabase") -> None:
        self.database = database

    async def execute(self, *args: Any, **kwargs: Any) -> None:
        self.database.statements += 1

    @asynccontextmanager
    async def transaction(self):  # noqa: ANN202
        yield


class FakeDatabase:
    """A pool of `size` connections that records how many were held at once."""

    def __init__(self, size: int) -> None:
        self._free = asyncio.Semaphore(size)
        self.held = 0
        self.max_held = 0
        self.statements = 0
        self.writing_tasks: set[Any] = set()
        self.counted: list[tuple[int, int, dict[str, int]]] = []
        self.transport: SlowTmdb | None = None

    @asynccontextmanager
    async def connection(self):  # noqa: ANN202
        async with self._free:
            self.held += 1
            self.max_held = max(self.max_held, self.held)
            task = asyncio.current_task()
            if self.transport is not None:
                self.transport.tasks_holding_a_connection.add(task)
            try:
                yield FakeConnection(self)
            finally:
                if self.transport is not None:
                    self.transport.tasks_holding_a_connection.discard(task)
                self.held -= 1


@pytest.fixture(autouse=True)
def no_real_database(monkeypatch: pytest.MonkeyPatch) -> None:
    async def load_context(database: Any, tmdb_ids: Any) -> FetchContext:
        return FetchContext(frozenset(), {}, {}, None)

    async def write(conn: Any, rows: Any) -> tuple[int, int]:
        await asyncio.sleep(0)  # the write is a real await: other films run meanwhile
        return 0, 0

    async def count(database: FakeDatabase, run_id: int, counts: Counter[str], errors: int) -> None:
        database.counted.append((run_id, errors, dict(counts)))

    monkeypatch.setattr(fetch, "load_context", load_context)
    monkeypatch.setattr(fetch, "_write", write)
    monkeypatch.setattr(fetch, "_count", count)


def client(fake_time: FakeTime, transport: SlowTmdb) -> TmdbClient:
    return TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)


def message(run_id: int, ids: range) -> FetchMessage:
    return FetchMessage(run_id=run_id, tmdb_ids=list(ids), reason="weekly")


async def test_the_films_of_one_message_share_the_eight_slots(fake_time: FakeTime) -> None:
    films = 32
    transport = SlowTmdb()
    database = FakeDatabase(size=3)
    tmdb = client(fake_time, transport)

    started = time.perf_counter()
    await run_fetch(database, tmdb, message(1, range(FIRST, FIRST + films)))  # type: ignore[arg-type]
    elapsed = time.perf_counter() - started

    assert CONCURRENCY == MAX_IN_FLIGHT == 8
    assert transport.max_in_flight == MAX_IN_FLIGHT  # filled, never exceeded
    # Sequential would take films * DELAY; eight at a time takes a quarter of that or less in
    # theory an eighth. A third leaves room for a slow CI machine.
    assert elapsed < films * DELAY / 3
    await tmdb.aclose()


async def test_counts_stay_exact_under_concurrency(fake_time: FakeTime) -> None:
    ids = range(FIRST, FIRST + 40)
    missing = frozenset(i for i in ids if i % 5 == 0)  # 8 films TMDB no longer knows
    transport = SlowTmdb(missing)
    database = FakeDatabase(size=3)
    tmdb = client(fake_time, transport)

    await run_fetch(database, tmdb, message(7, ids))  # type: ignore[arg-type]

    ((run_id, errors, counts),) = database.counted
    assert (run_id, errors) == (7, 0)
    assert counts["films_written"] == 32
    assert counts["films_not_found"] == 8
    assert transport.requests == 40
    await tmdb.aclose()


async def test_four_messages_at_once_share_one_limiter_and_one_small_pool(
    fake_time: FakeTime,
) -> None:
    transport = SlowTmdb()
    database = FakeDatabase(size=3)
    database.transport = transport
    tmdb = client(fake_time, transport)
    ranges = [range(FIRST + n * 100, FIRST + n * 100 + 16) for n in range(4)]

    async with asyncio.TaskGroup() as group:
        for n, ids in enumerate(ranges):
            group.create_task(run_fetch(database, tmdb, message(n, ids)))  # type: ignore[arg-type]

    assert transport.max_in_flight == MAX_IN_FLIGHT  # 4 messages x 8 films, 8 requests
    assert database.max_held <= 3
    assert sorted(run for run, _, _ in database.counted) == [0, 1, 2, 3]
    assert all(counts["films_written"] == 16 for _, _, counts in database.counted)
    # A connection is held for the write only: never while a film waits for TMDB.
    assert transport.asked_while_holding == []
    await tmdb.aclose()


async def test_the_time_spent_in_each_phase_is_counted(fake_time: FakeTime) -> None:
    transport = SlowTmdb()
    database = FakeDatabase(size=3)
    tmdb = client(fake_time, transport)

    await run_fetch(database, tmdb, message(1, range(FIRST, FIRST + 8)))  # type: ignore[arg-type]

    ((_, _, counts),) = database.counted
    assert counts["ms_tmdb"] >= 8 * DELAY * 1000 * 0.9
    assert all(counts.get(phase, 0) >= 0 for phase in fetch.PHASES)
    assert set(fetch.PHASES) == {"ms_tmdb", "ms_poster", "ms_pool_wait", "ms_read", "ms_write"}
    await tmdb.aclose()
