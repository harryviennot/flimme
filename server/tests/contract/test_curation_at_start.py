"""The curation file takes effect at worker start and at the start of a sweep, not only on
Sundays (the reference job). Real schema, as flimme_pipeline, no TMDB call.

The local database is shared and holds the seed, so every test uses invented services
(60,000,101 up, in France) and the `restore` fixture puts the seed's flags back.
"""

import logging
from collections.abc import AsyncIterator

import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.contract.conftest import open_database

from server.catalog.curation import Curation, ServicesCuration, load_curation
from server.catalog.reference import apply_curation
from server.db.pool import Database
from server.workers.pipeline import JOBS, Context

pytestmark = pytest.mark.anyio

SERVICE, FREE, OTHER, VARIANT, UNKNOWN = 60_000_101, 60_000_102, 60_000_103, 60_000_104, 60_000_199


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def restore(admin: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    """Four invented services in France with every flag off; the seed's flags put back, and the
    countries and ages the committed file adds (the UK since M24.6) taken out again, so later
    tests find only the seed's France."""
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
    for provider in (SERVICE, FREE, OTHER, VARIANT):
        await admin.execute(
            "insert into public.providers (id, name) values (%s, 'Invented')", (provider,)
        )
        await admin.execute(
            "insert into public.provider_regions (provider_id, country) values (%s, 'FR')",
            (provider,),
        )
    try:
        yield admin
    finally:
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
        await admin.execute(
            "delete from public.provider_regions where provider_id between 60000101 and 60000199"
        )
        await admin.execute("delete from public.providers where id between 60000101 and 60000199")
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


def services(**fields: object) -> Curation:
    """Only a France services section; the countries and ages of the file are left out."""
    return Curation(services={"FR": ServicesCuration.model_validate(fields)})


async def flags(conn: AsyncConnection) -> list[tuple[int, bool, bool]]:
    cur = await conn.execute(
        "select provider_id, is_listed, free_for_all from public.provider_regions"
        " where provider_id between 60000101 and 60000199 order by 1"
    )
    return await cur.fetchall()


async def versions(conn: AsyncConnection) -> list[tuple[str, str]]:
    cur = await conn.execute(
        "select xmin::text, 'r' from public.provider_regions"
        " where provider_id between 60000101 and 60000199"
        " union all select xmin::text, 'p' from public.providers"
        " where id between 60000101 and 60000199 order by 2, 1"
    )
    return await cur.fetchall()


async def test_a_start_on_a_database_with_flags_off_sets_them_from_the_curation(
    database: Database, restore: AsyncConnection
):
    curation = services(listed=[SERVICE], free=[FREE], variants={VARIANT: SERVICE})

    await apply_curation(database, curation)

    assert await flags(restore) == [
        (SERVICE, True, False),
        (FREE, False, True),
        (OTHER, False, False),
        (VARIANT, False, False),
    ]
    cur = await restore.execute("select parent_id from public.providers where id = %s", (VARIANT,))
    assert await cur.fetchone() == (SERVICE,)


async def test_a_start_applies_the_countries_and_ages_of_the_file_too(
    database: Database, restore: AsyncConnection
):
    await apply_curation(database, load_curation())

    cur = await restore.execute(
        "select catalog_enabled, default_language from public.countries where code = 'FR'"
    )
    assert await cur.fetchone() == (True, "fr")
    cur = await restore.execute("select count(*) from public.certification_ages where country='FR'")
    row = await cur.fetchone()
    assert row is not None and row[0] > 0


async def test_a_second_start_changes_nothing(database: Database, restore: AsyncConnection):
    curation = services(listed=[SERVICE], free=[FREE], variants={VARIANT: SERVICE})
    await apply_curation(database, curation)
    first = await versions(restore)
    first_flags = await flags(restore)

    await apply_curation(database, curation)

    assert await versions(restore) == first  # no row was rewritten
    assert await flags(restore) == first_flags


async def test_a_curated_id_missing_from_providers_warns_and_does_not_fail(
    database: Database, restore: AsyncConnection, caplog: pytest.LogCaptureFixture
):
    curation = services(
        listed=[SERVICE, UNKNOWN], variants={UNKNOWN + 1: SERVICE, VARIANT: UNKNOWN + 2}
    )

    with caplog.at_level(logging.WARNING):
        await apply_curation(database, curation)

    assert (SERVICE, True, False) in await flags(restore)  # the known ones still apply
    warnings = " ".join(r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)
    assert str(UNKNOWN) in warnings
    assert str(UNKNOWN + 1) in warnings
    assert str(UNKNOWN + 2) in warnings
    cur = await restore.execute("select parent_id from public.providers where id = %s", (VARIANT,))
    assert await cur.fetchone() == (None,)


async def test_a_sweep_after_a_curation_change_uses_the_new_flags(
    database: Database, restore: AsyncConnection
):
    context = Context(database, None, services(listed=[SERVICE]))
    await JOBS["availability_sweep"](context)
    assert await swept_providers(restore) >= {SERVICE}
    assert OTHER not in await swept_providers(restore)

    await restore.execute("truncate pgmq.q_catalog_refresh, pgmq.a_catalog_refresh")
    context = Context(database, None, services(listed=[OTHER]))
    await JOBS["availability_sweep"](context)

    swept = await swept_providers(restore)
    assert OTHER in swept
    assert SERVICE not in swept


async def swept_providers(conn: AsyncConnection) -> set[int]:
    cur = await conn.execute(
        "select (message->>'provider_id')::int from pgmq.q_catalog_refresh"
        " where message->>'kind' = 'sweep' and message->>'country' = 'FR'"
    )
    return {row[0] for row in await cur.fetchall()}
