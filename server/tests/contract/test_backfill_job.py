"""`server backfill` against the real schema, as flimme_pipeline (M2.9).

TMDB and the export file are replayed from synthetic data. The local database is shared and
holds the seed, so every test works with invented ids (films 60,000,501 up, genres 99,000,001
up, providers 60,000,101 up, country ZY) and the `restore` fixture puts everything back, the
seed films' quality scores included (the last step of a backfill sets every score).
"""

import copy
import gzip
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.conftest import FakeTime, FixtureTransport, fixture_json, json_reply
from tests.contract.conftest import open_database

from server.catalog.backfill import BackfillFailed, run_backfill
from server.catalog.curation import load_curation
from server.catalog.popularity import ExportSource
from server.catalog.tmdb import TmdbClient, TmdbRetryLater
from server.db.pool import Database

pytestmark = pytest.mark.anyio

FIRST_FILM = 60_000_501
FIRST_TEST_GENRE = 99_000_000
FIRST_TEST_PROVIDER = 60_000_100


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
    cur = await admin.execute(
        "select code, default_language, catalog_enabled from public.countries"
    )
    countries = await cur.fetchall()
    cur = await admin.execute("select country, certification from public.certification_ages")
    ages = await cur.fetchall()
    cur = await admin.execute(
        "select provider_id, country, display_priority, is_listed, free_for_all"
        " from public.provider_regions where provider_id < 60000000"
    )
    regions = await cur.fetchall()
    cur = await admin.execute("select id, parent_id from public.providers where id < 60000000")
    parents = await cur.fetchall()
    cur = await admin.execute(
        "select id, quality_score from public.titles where tmdb_id < 60000000"
    )
    scores = await cur.fetchall()
    try:
        yield admin
    finally:
        # The reference job sets the service flags of the seed's services: put them back.
        for provider, country, priority, listed, free in regions:
            await admin.execute(
                "update public.provider_regions set display_priority = %s, is_listed = %s,"
                " free_for_all = %s where provider_id = %s and country = %s",
                (priority, listed, free, provider, country),
            )
        for provider, parent in parents:
            await admin.execute(
                "update public.providers set parent_id = %s where id = %s", (parent, provider)
            )
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
        await admin.execute("delete from public.titles where tmdb_id between 60000000 and 60000999")
        await admin.execute("delete from public.people where id >= 97000000")
        await admin.execute("delete from public.keywords where id >= 98000000")
        await admin.execute("delete from public.genres where id >= %s", (FIRST_TEST_GENRE,))
        await admin.execute("delete from public.providers where id >= %s", (FIRST_TEST_PROVIDER,))
        await admin.execute(
            "delete from public.certification_ages where (country::text, certification)"
            " not in (select * from unnest(%s::text[], %s::text[]))",
            ([a[0] for a in ages], [a[1] for a in ages]),
        )
        await admin.execute(
            "delete from public.countries where code::text <> all(%s::text[])",
            ([c[0] for c in countries],),
        )
        for code, language, enabled in countries:
            await admin.execute(
                "update public.countries set default_language = %s, catalog_enabled = %s"
                " where code = %s",
                (language, enabled, code),
            )
        for title_id, score in scores:
            await admin.execute(
                "update public.titles set quality_score = %s where id = %s", (score, title_id)
            )


def film(tmdb_id: int, **changes: Any) -> dict[str, Any]:
    body = copy.deepcopy(fixture_json("tmdb/movie_full_60000010.json"))
    body["id"] = tmdb_id
    body["vote_count"] = 200
    body["vote_average"] = 8.0
    body.update(changes)
    return body


def tmdb_client(
    transport_class: type[FixtureTransport],
    fake_time: FakeTime,
    films: dict[int, httpx.Response],
    *,
    configuration: str = "configuration.json",
) -> tuple[TmdbClient, FixtureTransport]:
    script: dict[str, list[httpx.Response | Exception]] = {
        "/configuration": [json_reply(f"tmdb/{configuration}")],
        "/genre/movie/list": [
            json_reply("tmdb/genre_list_en.json"),
            json_reply("tmdb/genre_list_fr.json"),
        ],
        "/configuration/countries": [json_reply("tmdb/configuration_countries.json")],
        "/watch/providers/movie": [json_reply("tmdb/watch_providers_FR.json")],
        "/certification/movie/list": [json_reply("tmdb/certification_list.json")],
    }
    script |= {f"/movie/{tmdb_id}": [reply] for tmdb_id, reply in films.items()}
    transport = transport_class(script, clock=fake_time.clock)
    client = TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)
    return client, transport


def export(entries: list[tuple[int, float]], *, now: datetime | None = None) -> ExportSource:
    """The export file of 2 Nov 2026, the only one the mock transport has."""
    body = gzip.compress(
        "".join(
            json.dumps({"adult": False, "id": i, "popularity": p}) + "\n" for i, p in entries
        ).encode()
    )

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/p/exports/movie_ids_11_02_2026.json.gz":
            return httpx.Response(200, content=body)
        return httpx.Response(404)

    return ExportSource(
        transport=httpx.MockTransport(handle),
        clock=lambda: now or datetime(2026, 11, 2, 9, tzinfo=UTC),
    )


def ok(tmdb_id: int, **changes: Any) -> httpx.Response:
    return httpx.Response(200, json=film(tmdb_id, **changes))


def requested_films(transport: FixtureTransport) -> list[int]:
    return [
        int(r.url.path.rsplit("/", 1)[1])
        for r in transport.requests
        if r.url.path.startswith("/3/movie/")
    ]


async def one(conn: AsyncConnection, query: str, *args: Any) -> tuple[Any, ...]:
    cur = await conn.execute(query, args)  # type: ignore[arg-type]
    row = await cur.fetchone()
    assert row is not None
    return row


async def test_limit_caps_the_candidates_and_known_films_are_not_fetched_again(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    ids = [FIRST_FILM + i for i in range(6)]
    entries = [(i, 100.0 - n) for n, i in enumerate(ids)]
    await restore.execute(
        "insert into public.titles (tmdb_id, original_title) values (%s, 'Invented')", (ids[1],)
    )
    films = {i: ok(i) for i in ids}
    tmdb, transport = tmdb_client(transport_class, fake_time, films)

    await run_backfill(database, tmdb, load_curation(), export(entries), limit=3)

    assert requested_films(transport) == [ids[0], ids[2]]  # the top 3, minus the stored one
    (count,) = await one(
        restore,
        "select count(*) from public.titles where tmdb_id between %s and %s",
        ids[0],
        ids[5],
    )
    assert count == 3  # ids[1] was there already, ids[0] and ids[2] arrived, ids[3:] never asked


async def test_stopped_midway_it_resumes_from_the_cursor(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    ids = [FIRST_FILM + 10 + i for i in range(5)]
    entries = [(i, 100.0 - n) for n, i in enumerate(ids)]
    films = {i: ok(i) for i in ids}
    films[ids[2]] = httpx.Response(503)  # the second chunk (ids 2 and 3) fails
    tmdb, transport = tmdb_client(transport_class, fake_time, films)

    with pytest.raises(TmdbRetryLater):
        await run_backfill(database, tmdb, load_curation(), export(entries), chunk_size=2)

    (run_id, finished, cursor) = await one(
        restore,
        "select id, finished_at is not null, cursor from public.ingest_runs"
        " where kind = 'backfill'",
    )
    assert not finished
    assert cursor["position"] == 2 and cursor["export_day"] == "2026-11-02"

    # Days later, with only the original file still there: the cursor names the file.
    films = {i: ok(i) for i in ids}
    tmdb, transport = tmdb_client(transport_class, fake_time, films)
    later = datetime(2026, 11, 20, 9, tzinfo=UTC)
    result = await run_backfill(
        database, tmdb, load_curation(), export(entries, now=later), chunk_size=2
    )

    assert result.run_id == run_id and result.resumed
    assert requested_films(transport) == ids[2:]  # the first chunk is not fetched again
    (runs,) = await one(restore, "select count(*) from public.ingest_runs where kind = 'backfill'")
    assert runs == 1
    (finished, cursor) = await one(
        restore,
        "select finished_at is not null, cursor from public.ingest_runs where id = %s",
        run_id,
    )
    assert finished and cursor["position"] == 5
    (stored,) = await one(
        restore,
        "select count(*) from public.titles where tmdb_id between %s and %s",
        ids[0],
        ids[4],
    )
    assert stored == 5


async def test_c_and_every_quality_score_are_set_at_the_end(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    ids = [FIRST_FILM + 20 + i for i in range(3)]
    entries = [(i, 100.0 - n) for n, i in enumerate(ids)]
    films = {
        ids[0]: ok(ids[0], vote_average=9.0, vote_count=1000),
        ids[1]: ok(ids[1], vote_average=5.0, vote_count=40),
        ids[2]: ok(ids[2], vote_average=7.0, vote_count=100),
    }
    tmdb, _ = tmdb_client(transport_class, fake_time, films)
    await restore.execute("update public.titles set quality_score = null")

    result = await run_backfill(database, tmdb, load_curation(), export(entries), quality_chunk=50)

    (nulls,) = await one(restore, "select count(*) from public.titles where quality_score is null")
    assert nulls == 0  # the seed's films too, over several chunks of ids
    (c,) = await one(
        restore,
        "select avg(vote_average)::float8 from public.titles"
        " where is_active and not is_adult and vote_count >= 30",
    )
    assert result.average == pytest.approx(c)
    (score,) = await one(
        restore, "select quality_score from public.titles where tmdb_id = %s", ids[1]
    )
    # (v / (v + m)) * R + (m / (v + m)) * C with m = 100
    assert score == pytest.approx((40 / 140) * 5.0 + (100 / 140) * c, abs=1e-3)
    (stats,) = await one(
        restore, "select stats from public.ingest_runs where id = %s", result.run_id
    )
    assert stats["quality_scores_set"] > 500


async def test_a_candidate_under_the_floor_is_counted_and_not_stored(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    ids = [FIRST_FILM + 30 + i for i in range(2)]
    entries = [(i, 100.0 - n) for n, i in enumerate(ids)]
    films = {ids[0]: ok(ids[0]), ids[1]: ok(ids[1], vote_count=3)}
    tmdb, _ = tmdb_client(transport_class, fake_time, films)

    result = await run_backfill(database, tmdb, load_curation(), export(entries))

    (stored,) = await one(
        restore,
        "select count(*) from public.titles where tmdb_id between %s and %s",
        ids[0],
        ids[1],
    )
    assert stored == 1
    (stats,) = await one(
        restore, "select stats from public.ingest_runs where id = %s", result.run_id
    )
    assert stats["films_written"] == 1 and stats["films_below_floor"] == 1


async def test_a_failed_reference_step_stops_the_backfill_before_it_opens_its_run(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    tmdb, transport = tmdb_client(
        transport_class, fake_time, {}, configuration="configuration_missing_size.json"
    )

    with pytest.raises(BackfillFailed, match="reference"):
        await run_backfill(database, tmdb, load_curation(), export([(FIRST_FILM, 1.0)]))

    assert requested_films(transport) == []
    (runs,) = await one(restore, "select count(*) from public.ingest_runs where kind = 'backfill'")
    assert runs == 0
