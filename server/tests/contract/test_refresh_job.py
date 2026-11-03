"""The refresh schedule against the real schema and queue, as flimme_pipeline (M2.11).

TMDB's `/movie/changes` is a synthetic transport. The local database is shared and holds the
seed, so every test works with invented ids (films 60,002,000 up, service 60,000,201) and the
`restore` fixture removes what it added and puts the seed's scores back.
"""

import logging
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Any, LiteralString, cast

import httpx
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.conftest import FakeTime
from tests.contract.conftest import open_database

from server.catalog.refresh import (
    record_agreement,
    run_changes_daily,
    run_details_monthly,
    run_details_weekly,
)
from server.catalog.tmdb import TmdbClient, TmdbRetryLater
from server.db.pool import Database
from server.workers.runner import Done

pytestmark = pytest.mark.anyio

FIRST = 60_002_000
SERVICE = 60_000_201
NOW = datetime(2026, 11, 3, 5, 0, tzinfo=UTC)


class Changes(httpx.AsyncBaseTransport):
    """A synthetic `/3/movie/changes`: the ids that changed, `page_size` to a page."""

    def __init__(self, ids: list[int], *, page_size: int = 100, fail_page: int | None = None):
        self.ids = ids
        self.page_size = page_size
        self.fail_page = fail_page
        self.requests: list[dict[str, str]] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/3/movie/changes", f"unexpected request {request.url.path}"
        params = dict(request.url.params)
        self.requests.append(params)
        page = int(params["page"])
        if page == self.fail_page:
            return httpx.Response(503, json={"status_message": "down"})
        total_pages = max(1, -(-len(self.ids) // self.page_size))
        start = (page - 1) * self.page_size
        results = [{"id": i, "adult": False} for i in self.ids[start : start + self.page_size]]
        return httpx.Response(
            200,
            json={
                "results": results,
                "page": page,
                "total_pages": total_pages,
                "total_results": len(self.ids),
            },
        )

    def window(self) -> tuple[date, date]:
        first = self.requests[0]
        return date.fromisoformat(first["start_date"]), date.fromisoformat(first["end_date"])


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def restore(admin: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    """A service and a person to hang rows on; cleanup of everything a test adds; the seed's
    quality scores back as they were (the weekly job sets every score)."""
    cur = await admin.execute("select coalesce(max(id), 0) from public.ingest_runs")
    row = await cur.fetchone()
    assert row is not None
    last_run = row[0]
    cur = await admin.execute("select id, quality_score from public.titles")
    scores = await cur.fetchall()
    await admin.execute(
        "insert into public.providers (id, name) values (%s, 'Invented')", (SERVICE,)
    )
    await admin.execute("insert into public.people (id, name) values (%s, 'Invented')", (FIRST,))
    try:
        yield admin
    finally:
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
        await admin.execute("delete from public.titles where tmdb_id between 60002000 and 60002999")
        await admin.execute("delete from public.people where id = %s", (FIRST,))
        await admin.execute("delete from public.providers where id = %s", (SERVICE,))
        await admin.execute(
            "update public.titles t set quality_score = s.score"
            " from unnest(%s::bigint[], %s::real[]) as s(id, score) where t.id = s.id",
            ([i for i, _ in scores], [s for _, s in scores]),
        )


def tmdb(transport: httpx.AsyncBaseTransport, fake_time: FakeTime) -> TmdbClient:
    return TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)


async def add_film(
    conn: AsyncConnection,
    number: int,
    *,
    tier: int = 1,
    active: bool = True,
    missing_months: int | None = None,
    votes: int = 0,
    average: float | None = None,
) -> int:
    """One film, tmdb id FIRST + number. Returns the tmdb id."""
    tmdb_id = FIRST + number
    await conn.execute(
        "insert into public.titles (tmdb_id, original_title, refresh_tier, is_active,"
        " vote_count, vote_average, popularity, poster_path, tmdb_missing_since)"
        " values (%s, 'Invented', %s, %s, %s, %s, 12.5, '/p.jpg',"
        " case when %s::int is null then null else now() - make_interval(months => %s::int) end)",
        (tmdb_id, tier, active, votes, average, missing_months, missing_months),
    )
    return tmdb_id


async def add_children(conn: AsyncConnection, tmdb_id: int) -> None:
    """Everything TMDB gave us for a film: text, credits, certification, offer, link, vector."""
    from_title = "from public.titles where tmdb_id = %s"
    inserts = [
        "insert into public.title_translations (title_id, language, title, overview)"
        " select id, 'en', 'Invented', 'Text' " + from_title,
        "insert into public.title_credits (title_id, person_id, role)"
        " select id, 60002000, 'director' " + from_title,
        "insert into public.title_certifications (title_id, country, certification)"
        " select id, 'FR', '12' " + from_title,
        "insert into public.title_availability (title_id, country, provider_id, kind)"
        " select id, 'FR', 60000201, 'subscription' " + from_title,
        "insert into public.title_watch_links (title_id, country, tmdb_link)"
        " select id, 'FR', 'https://example.test/watch' " + from_title,
        "insert into public.title_vectors (title_id, embedding, source_hash)"
        " select id, array_fill(0.1::real, array[384])::extensions.vector, 'h' " + from_title,
    ]
    for insert in inserts:
        await conn.execute(cast(LiteralString, insert), (tmdb_id,))


async def queued(conn: AsyncConnection) -> list[dict[str, Any]]:
    cur = await conn.execute("select message from pgmq.q_catalog_refresh order by msg_id")
    return [row[0] for row in await cur.fetchall()]


def mine(messages: list[dict[str, Any]], reason: str) -> list[int]:
    """The ids of our invented films among the fetch messages of one reason, in queue order."""
    found: list[int] = []
    for message in messages:
        assert message["kind"] == "fetch" and len(message["tmdb_ids"]) <= 100
        if message["reason"] == reason:
            found += [i for i in message["tmdb_ids"] if 60_002_000 <= i < 60_003_000]
    return found


async def run_row(conn: AsyncConnection, kind: str) -> dict[str, Any]:
    cur = await conn.execute(
        "select id, stats, errors, finished_at, note from public.ingest_runs"
        " where kind = %s order by id desc limit 1",
        (kind,),
    )
    row = await cur.fetchone()
    assert row is not None
    return {"id": row[0], "stats": row[1], "errors": row[2], "finished": row[3], "note": row[4]}


async def past_run(
    conn: AsyncConnection, kind: str, finished_at: datetime, stats: dict[str, Any]
) -> int:
    """A run that ended at a given time."""
    import json

    cur = await conn.execute(
        "insert into public.ingest_runs (kind, started_at, finished_at, stats)"
        " values (%s, %s, %s, %s) returning id",
        (kind, finished_at - timedelta(minutes=5), finished_at, json.dumps(stats)),
    )
    row = await cur.fetchone()
    assert row is not None
    return row[0]


async def changes(
    database: Database, fake_time: FakeTime, ids: list[int], **options: Any
) -> Changes:
    transport = Changes(ids, **options)
    outcome = await run_changes_daily(database, tmdb(transport, fake_time), now=NOW)
    assert outcome == Done()
    return transport


# --- changes_daily


async def test_changes_after_a_3_day_gap_cover_3_days(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    await past_run(restore, "changes_daily", NOW - timedelta(days=3), {"changes_days": 1})

    transport = await changes(database, fake_time, [])

    start, end = transport.window()
    assert end == NOW.date()
    assert (end - start).days == 3
    assert (await run_row(restore, "changes_daily"))["stats"]["changes_days"] == 3


async def test_changes_after_20_days_cover_14(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    await past_run(restore, "changes_daily", NOW - timedelta(days=20), {"changes_days": 1})

    transport = await changes(database, fake_time, [])

    start, end = transport.window()
    assert (end - start).days == 14


async def test_a_run_that_failed_does_not_move_the_window(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    await past_run(restore, "changes_daily", NOW - timedelta(days=3), {"changes_days": 1})
    # Yesterday's run ended with an error and never read the feed to the end.
    await past_run(restore, "changes_daily", NOW - timedelta(days=1), {})
    transport = await changes(database, fake_time, [])
    start, end = transport.window()
    assert (end - start).days == 3


async def test_a_page_that_fails_leaves_an_errored_run_and_the_message_comes_back(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    film = await add_film(restore, 1)
    transport = Changes([film, film + 1], page_size=1, fail_page=2)

    with pytest.raises(TmdbRetryLater):
        await run_changes_daily(database, tmdb(transport, fake_time), now=NOW)

    row = await run_row(restore, "changes_daily")
    assert row["errors"] == 1
    assert row["finished"] is not None
    assert "changes_days" not in row["stats"]
    assert mine(await queued(restore), "changes") == []


async def test_changes_ignore_films_not_in_the_catalog(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    held = [await add_film(restore, 1), await add_film(restore, 2, tier=2, active=False)]
    unknown = [FIRST + 500, FIRST + 501]

    await changes(database, fake_time, [unknown[0], held[0], unknown[1], held[1]], page_size=2)

    assert sorted(mine(await queued(restore), "changes")) == sorted(held)
    stats = (await run_row(restore, "changes_daily"))["stats"]
    assert stats["changes_seen"] == 4
    assert stats["films_queued"] == 2


async def test_changes_queue_at_most_100_films_to_a_message(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    films = [await add_film(restore, n) for n in range(250)]
    await changes(database, fake_time, films, page_size=100)
    messages = [m for m in await queued(restore) if m["reason"] == "changes"]
    assert sorted(len(m["tmdb_ids"]) for m in messages) == [50, 100, 100]
    run_id = (await run_row(restore, "changes_daily"))["id"]
    assert {m["run_id"] for m in messages} == {run_id}


# --- details_weekly and details_monthly


async def test_the_weekly_job_picks_tier_1_films_that_tmdb_still_lists(
    database: Database, restore: AsyncConnection
):
    tier1 = [await add_film(restore, 1), await add_film(restore, 2)]
    await add_film(restore, 3, tier=2)
    await add_film(restore, 4, tier=1, active=False)
    await add_film(restore, 5, tier=2, active=False)

    assert await run_details_weekly(database) == Done()

    messages = await queued(restore)
    assert set(mine(messages, "weekly")) == set(tier1)
    assert mine(messages, "monthly") == []
    row = await run_row(restore, "details_weekly")
    assert row["finished"] is not None
    assert row["errors"] == 0


async def test_the_monthly_job_picks_tier_2_and_inactive_films(
    database: Database, restore: AsyncConnection
):
    await add_film(restore, 1)
    await add_film(restore, 2)
    second = [
        await add_film(restore, 3, tier=2),
        await add_film(restore, 4, tier=1, active=False),
        await add_film(restore, 5, tier=2, active=False),
    ]

    assert await run_details_monthly(database) == Done()

    messages = await queued(restore)
    assert set(mine(messages, "monthly")) == set(second)
    assert mine(messages, "weekly") == []


async def test_a_film_missing_for_over_6_months_is_cleared_and_its_row_stays(
    database: Database, restore: AsyncConnection
):
    film = await add_film(
        restore, 1, tier=2, active=False, missing_months=7, votes=900, average=7.5
    )
    await add_children(restore, film)
    cur = await restore.execute(
        "select id, tmdb_missing_since from public.titles where tmdb_id = %s", (film,)
    )
    row = await cur.fetchone()
    assert row is not None
    title_id, missing_since = row

    await run_details_monthly(database)

    cur = await restore.execute(
        "select media_type::text, tmdb_id, is_active, tmdb_missing_since, original_title,"
        " imdb_id, release_date, vote_average, vote_count, popularity, quality_score,"
        " poster_path, genre_ids, keyword_ids from public.titles where id = %s",
        (title_id,),
    )
    assert await cur.fetchone() == (
        "movie",
        film,
        False,
        missing_since,
        None,
        None,
        None,
        None,
        0,
        0,
        None,
        None,
        [],
        [],
    )
    for table in (
        "title_translations",
        "title_credits",
        "title_certifications",
        "title_availability",
        "title_watch_links",
        "title_vectors",
    ):
        query = f"select count(*) from public.{table} where title_id = %s"  # noqa: S608
        cur = await restore.execute(cast(LiteralString, query), (title_id,))
        assert await cur.fetchone() == (0,), table
    assert (await run_row(restore, "details_monthly"))["stats"]["films_cleared"] >= 1


async def test_a_film_missing_for_5_months_is_untouched(
    database: Database, restore: AsyncConnection
):
    film = await add_film(
        restore, 1, tier=2, active=False, missing_months=5, votes=900, average=7.5
    )
    await add_children(restore, film)

    await run_details_monthly(database)

    cur = await restore.execute(
        "select original_title, vote_count, poster_path from public.titles where tmdb_id = %s",
        (film,),
    )
    assert await cur.fetchone() == ("Invented", 900, "/p.jpg")
    cur = await restore.execute(
        "select (select count(*) from public.title_translations where title_id = t.id),"
        " (select count(*) from public.title_vectors where title_id = t.id)"
        " from public.titles t where tmdb_id = %s",
        (film,),
    )
    assert await cur.fetchone() == (1, 1)


async def test_a_cleared_film_is_cleared_once_and_still_fetched_each_month(
    database: Database, restore: AsyncConnection
):
    film = await add_film(
        restore, 1, tier=2, active=False, missing_months=8, votes=900, average=7.5
    )

    await run_details_monthly(database)
    await restore.execute("truncate pgmq.q_catalog_refresh")
    await run_details_monthly(database)

    assert (await run_row(restore, "details_monthly"))["stats"]["films_cleared"] == 0
    assert mine(await queued(restore), "monthly") == [film]  # TMDB may have it again


async def average_vote(conn: AsyncConnection) -> float:
    cur = await conn.execute(
        "select avg(vote_average)::float8 from public.titles"
        " where is_active and not is_adult and vote_count >= 30"
    )
    row = await cur.fetchone()
    assert row is not None
    return row[0]


async def score(conn: AsyncConnection, film: int) -> float:
    cur = await conn.execute("select quality_score from public.titles where tmdb_id = %s", (film,))
    row = await cur.fetchone()
    assert row is not None
    return row[0]


async def test_c_is_recomputed_weekly_and_every_score_follows_it(
    database: Database, restore: AsyncConnection
):
    film = await add_film(restore, 1, votes=100, average=8.0)  # v = m: halfway between R and C

    await run_details_weekly(database)

    c = await average_vote(restore)
    assert await score(restore, film) == pytest.approx((8.0 + c) / 2, abs=1e-3)
    stats = (await run_row(restore, "details_weekly"))["stats"]
    assert stats["quality_c"] == pytest.approx(c, abs=1e-3)
    assert stats["scores_set"] >= 1

    # The catalog's average moves; nothing stored it, so the next run follows it.
    await add_film(restore, 2, votes=400, average=10.0)
    await run_details_weekly(database)

    c2 = await average_vote(restore)
    assert c2 != pytest.approx(c, abs=1e-3)
    assert await score(restore, film) == pytest.approx((8.0 + c2) / 2, abs=1e-3)


# --- the agreement share


async def test_the_agreement_share_is_recorded_once_the_fetches_are_over(
    database: Database, restore: AsyncConnection, caplog: pytest.LogCaptureFixture
):
    now = datetime.now(UTC)
    stale = {"offers_compared": 200, "availability_disagreements": 6}
    over = await past_run(restore, "details_weekly", now - timedelta(hours=13), stale)
    running = await past_run(restore, "details_weekly", now - timedelta(hours=1), stale)
    nothing = await past_run(restore, "details_weekly", now - timedelta(days=2), {})

    with caplog.at_level(logging.ERROR):
        recorded = await record_agreement(database)

    assert (over, 97.0) in recorded
    assert running not in [i for i, _ in recorded] and nothing not in [i for i, _ in recorded]
    cur = await restore.execute(
        "select id, stats ->> 'agreement_percent' from public.ingest_runs where id = any(%s)",
        ([over, running, nothing],),
    )
    assert dict(await cur.fetchall()) == {over: "97", running: None, nothing: None}
    assert any("agreement under 98" in r.getMessage() for r in caplog.records)  # M9.5 alerts

    assert await record_agreement(database) == []  # recorded once


async def test_the_weekly_job_records_the_share_of_the_week_before(
    database: Database, restore: AsyncConnection
):
    last_week = await past_run(
        restore,
        "details_weekly",
        datetime.now(UTC) - timedelta(days=7),
        {"offers_compared": 1000, "availability_disagreements": 5},
    )

    await run_details_weekly(database)

    cur = await restore.execute(
        "select (stats ->> 'agreement_percent')::float8 from public.ingest_runs where id = %s",
        (last_week,),
    )
    assert await cur.fetchone() == (99.5,)
