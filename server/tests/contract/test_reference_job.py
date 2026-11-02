"""The reference data job against the real schema, as flimme_pipeline (M2.5).

TMDB is replayed from synthetic fixtures. The local database is shared and holds the seed, so
every test works with invented ids (genres 99,000,001 up, providers 60,000,101 up, country ZY)
and the `restore` fixture puts everything it touched back.
"""

import logging
from collections.abc import AsyncIterator
from typing import Any

import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.contract.conftest import open_database

from server.catalog.curation import Curation, load_curation
from server.catalog.reference import run_reference_weekly
from server.catalog.tmdb import TmdbClient
from server.db.pool import Database

pytestmark = pytest.mark.anyio

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
    """Leaves the shared database as it was found: seed rows kept, test rows removed."""
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
    try:
        yield admin
    finally:
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
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


def make_tmdb(
    transport_class: Any, reply: Any, fake_time: Any, *, configuration: str = "configuration.json"
) -> TmdbClient:
    script = {
        "/configuration": [reply(f"tmdb/{configuration}")],
        "/genre/movie/list": [reply("tmdb/genre_list_en.json"), reply("tmdb/genre_list_fr.json")],
        "/configuration/countries": [reply("tmdb/configuration_countries.json")],
        "/watch/providers/movie": [reply("tmdb/watch_providers_FR.json")],
        "/certification/movie/list": [reply("tmdb/certification_list.json")],
    }
    transport = transport_class(script, clock=fake_time.clock)
    return TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)


async def snapshot(conn: AsyncConnection) -> list[Any]:
    out: list[Any] = []
    for query in (
        "select * from public.genres where id >= 99000000 order by id",
        "select * from public.countries order by code",
        "select * from public.providers where id >= 60000100 order by id",
        "select * from public.provider_regions where provider_id >= 60000100 order by 1, 2",
        "select * from public.certification_ages order by 1, 2",
    ):
        cur = await conn.execute(query)  # type: ignore[arg-type]
        out.append(await cur.fetchall())
    return out


async def test_genres_get_both_names_and_a_slug(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    tmdb = make_tmdb(transport_class, reply, fake_time)
    await run_reference_weekly(database, tmdb, load_curation())

    cur = await restore.execute(
        "select id, slug, names from public.genres where id >= %s order by id", (FIRST_TEST_GENRE,)
    )
    assert await cur.fetchall() == [
        (99000001, "invented_comedy", {"en": "Invented Comedy", "fr": "Comédie inventée"}),
        (
            99000002,
            "invented_science_fiction",
            {"en": "Invented Science Fiction", "fr": "Science-fiction inventée"},
        ),
    ]


async def test_a_rerun_changes_nothing(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    await run_reference_weekly(
        database, make_tmdb(transport_class, reply, fake_time), load_curation()
    )
    first = await snapshot(restore)
    await run_reference_weekly(
        database, make_tmdb(transport_class, reply, fake_time), load_curation()
    )
    assert await snapshot(restore) == first


async def test_a_new_country_is_inserted_disabled_and_france_stays_enabled(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    await run_reference_weekly(
        database, make_tmdb(transport_class, reply, fake_time), load_curation()
    )

    cur = await restore.execute(
        "select code, default_language, catalog_enabled from public.countries"
        " where code in ('FR', 'ZY') order by code"
    )
    assert await cur.fetchall() == [("FR", "fr", True), ("ZY", "en", False)]


async def test_a_provider_upsert_keeps_the_curated_flags(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    await restore.execute("insert into public.providers (id, name) values (60000100, 'Old name')")
    await restore.execute("insert into public.providers (id, name) values (60000101, 'Old name')")
    await restore.execute("update public.providers set parent_id = 60000100 where id = 60000101")
    await restore.execute(
        "insert into public.provider_regions"
        " (provider_id, country, display_priority, is_listed, free_for_all)"
        " values (60000101, 'FR', 50, true, true)"
    )
    await run_reference_weekly(
        database, make_tmdb(transport_class, reply, fake_time), load_curation()
    )

    cur = await restore.execute(
        "select p.name, p.logo_path, p.parent_id, pr.display_priority, pr.is_listed,"
        " pr.free_for_all from public.providers p"
        " join public.provider_regions pr on pr.provider_id = p.id and pr.country = 'FR'"
        " where p.id = 60000101"
    )
    assert await cur.fetchone() == (
        "Invented Service One",
        "/fixture-p1.png",
        60000100,
        2,
        True,
        True,
    )
    cur = await restore.execute(
        "select is_listed, free_for_all from public.provider_regions where provider_id = 60000102"
    )
    assert await cur.fetchone() == (False, False)


async def test_a_curated_service_missing_from_tmdb_stays_and_a_warning_is_logged(
    database: Database,
    restore: AsyncConnection,
    transport_class,
    reply,
    fake_time,
    caplog: pytest.LogCaptureFixture,
):
    await restore.execute("insert into public.providers (id, name) values (60000150, 'Gone')")
    await restore.execute(
        "insert into public.provider_regions (provider_id, country, is_listed)"
        " values (60000150, 'FR', true)"
    )
    with caplog.at_level(logging.WARNING, logger="server.catalog.reference"):
        await run_reference_weekly(
            database, make_tmdb(transport_class, reply, fake_time), load_curation()
        )

    cur = await restore.execute(
        "select is_listed from public.provider_regions where provider_id = 60000150"
    )
    assert await cur.fetchone() == (True,)
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("60000150" in r.getMessage() for r in warnings)


async def test_curation_sets_the_french_and_us_ages(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    await run_reference_weekly(
        database, make_tmdb(transport_class, reply, fake_time), load_curation()
    )

    cur = await restore.execute(
        "select country, certification, min_age from public.certification_ages"
        " where country in ('FR', 'US') order by country, min_age, certification"
    )
    assert await cur.fetchall() == [
        ("FR", "U", 0),
        ("FR", "10", 10),
        ("FR", "12", 12),
        ("FR", "16", 16),
        ("FR", "18", 18),
        ("US", "G", 0),
        ("US", "PG", 7),
        ("US", "PG-13", 13),
        ("US", "R", 17),
        ("US", "NC-17", 18),
    ]


async def test_curation_flags_apply_only_to_the_countries_that_list_services(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    curation = Curation.model_validate(
        {
            "countries": {"FR": {"enabled": True, "language": "fr"}},
            "services": {
                "FR": {
                    "listed": [60000101],
                    "free": [60000102],
                    "variants": {"60000102": 60000101},
                    "order": {"60000101": 4},
                }
            },
        }
    )
    await run_reference_weekly(database, make_tmdb(transport_class, reply, fake_time), curation)

    cur = await restore.execute(
        "select p.id, p.parent_id, pr.is_listed, pr.free_for_all, pr.display_priority"
        " from public.providers p join public.provider_regions pr on pr.provider_id = p.id"
        " where p.id in (60000101, 60000102) and pr.country = 'FR' order by p.id"
    )
    assert await cur.fetchall() == [
        (60000101, None, True, False, 4),
        (60000102, 60000101, False, True, 9),
    ]


async def test_a_missing_image_size_fails_the_run_with_an_error_in_ingest_runs(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    tmdb = make_tmdb(
        transport_class, reply, fake_time, configuration="configuration_missing_size.json"
    )
    await run_reference_weekly(database, tmdb, load_curation())

    cur = await restore.execute(
        "select errors, note, finished_at is not null from public.ingest_runs"
        " where kind = 'reference_weekly' order by id desc limit 1"
    )
    errors, note, finished = (await cur.fetchone()) or (None, None, None)
    assert errors == 1
    assert finished is True
    assert note is not None and "w342" in note
    # Nothing was written before the check failed.
    cur = await restore.execute(
        "select count(*) from public.genres where id >= %s", (FIRST_TEST_GENRE,)
    )
    assert await cur.fetchone() == (0,)


async def test_the_run_row_ends_with_finished_at_and_counts(
    database: Database, restore: AsyncConnection, transport_class, reply, fake_time
):
    await run_reference_weekly(
        database, make_tmdb(transport_class, reply, fake_time), load_curation()
    )

    cur = await restore.execute(
        "select finished_at is not null, errors, stats from public.ingest_runs"
        " where kind = 'reference_weekly' order by id desc limit 1"
    )
    row = await cur.fetchone()
    assert row is not None
    finished, errors, stats = row
    assert finished is True
    assert errors == 0
    assert stats["genres"] == 2
    assert stats["countries_added"] == 1
    assert stats["providers"] == 2
    assert stats["provider_regions"] == 2
    assert stats["certifications_without_age"] == 2  # FR "TP", US "NR"
    assert stats["requests"] == 6
    assert stats["rate_limited"] == 0
