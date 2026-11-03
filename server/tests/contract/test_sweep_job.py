"""The availability sweep against the real schema and queue, as flimme_pipeline (M2.10).

TMDB's `/discover/movie` is a synthetic transport. The local database is shared and holds the
seed, so every test works with invented ids (services 60,000,101 and 60,000,102 in France,
films 60,001,000 up) and the `restore` fixture removes what it added.
"""

import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.conftest import FakeTime
from tests.contract.conftest import open_database
from tests.discover import Discover

from server.catalog.sweep import run_availability_sweep, run_sweep
from server.catalog.tmdb import TmdbClient, TmdbRetryLater
from server.db.payloads import SweepMessage
from server.db.pool import Database
from server.workers.runner import Done

pytestmark = pytest.mark.anyio

SERVICE, OTHER = 60_000_101, 60_000_102
FIRST = 60_001_000
TODAY = datetime(2026, 11, 3, tzinfo=UTC).date()


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def restore(admin: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    """Two listed services in France, and cleanup of everything a test adds."""
    cur = await admin.execute("select coalesce(max(id), 0) from public.ingest_runs")
    row = await cur.fetchone()
    assert row is not None
    last_run = row[0]
    for provider in (SERVICE, OTHER):
        await admin.execute(
            "insert into public.providers (id, name) values (%s, 'Invented')", (provider,)
        )
        await admin.execute(
            "insert into public.provider_regions (provider_id, country, is_listed)"
            " values (%s, 'FR', true)",
            (provider,),
        )
    try:
        yield admin
    finally:
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
        await admin.execute("delete from public.titles where tmdb_id between 60001000 and 60001999")
        await admin.execute(
            "delete from public.provider_regions where provider_id between 60000101 and 60000199"
        )
        await admin.execute("delete from public.providers where id between 60000101 and 60000199")


def tmdb(transport: httpx.AsyncBaseTransport, fake_time: FakeTime) -> TmdbClient:
    return TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)


async def add_films(conn: AsyncConnection, count: int, start: int = 0, tier: int = 1) -> list[int]:
    ids = [FIRST + start + i for i in range(count)]
    for tmdb_id in ids:
        await conn.execute(
            "insert into public.titles (tmdb_id, original_title, refresh_tier)"
            " values (%s, 'Invented', %s)",
            (tmdb_id, tier),
        )
    return ids


async def add_offers(
    conn: AsyncConnection,
    films: list[int],
    kind: str = "subscription",
    provider: int = SERVICE,
    days_old: int = 2,
) -> None:
    """Offers that an earlier night saw."""
    for tmdb_id in films:
        await conn.execute(
            "insert into public.title_availability"
            " (title_id, country, provider_id, kind, checked_at)"
            " select id, 'FR', %s, %s::public.offer_kind, now() - make_interval(days => %s)"
            " from public.titles where tmdb_id = %s",
            (provider, kind, days_old, tmdb_id),
        )


async def open_run(conn: AsyncConnection, steps: int = 1) -> int:
    cur = await conn.execute(
        "insert into public.ingest_runs (kind, cursor) values ('availability_sweep', %s)"
        " returning id",
        (json.dumps({"steps": steps, "done": []}),),
    )
    row = await cur.fetchone()
    assert row is not None
    return row[0]


async def offers(conn: AsyncConnection, provider: int = SERVICE) -> dict[int, set[str]]:
    cur = await conn.execute(
        "select t.tmdb_id, a.kind::text from public.title_availability a"
        " join public.titles t on t.id = a.title_id"
        " where a.provider_id = %s and t.tmdb_id between 60001000 and 60001999",
        (provider,),
    )
    found: dict[int, set[str]] = {}
    for tmdb_id, kind in await cur.fetchall():
        found.setdefault(tmdb_id, set()).add(kind)
    return found


async def tiers(conn: AsyncConnection) -> dict[int, int]:
    cur = await conn.execute(
        "select tmdb_id, refresh_tier from public.titles"
        " where tmdb_id between 60001000 and 60001999"
    )
    return dict(await cur.fetchall())


async def run_stats(conn: AsyncConnection, run_id: int) -> dict[str, Any]:
    cur = await conn.execute(
        "select stats, errors, finished_at, cursor from public.ingest_runs where id = %s",
        (run_id,),
    )
    stats, errors, finished_at, cursor = await cur.fetchone() or ({}, 0, None, None)
    return {**stats, "_errors": errors, "_finished": finished_at is not None, "_cursor": cursor}


async def queued(conn: AsyncConnection) -> list[dict[str, Any]]:
    cur = await conn.execute("select message from pgmq.q_catalog_refresh order by msg_id")
    return [row[0] for row in await cur.fetchall()]


def step(run_id: int, provider: int = SERVICE) -> SweepMessage:
    return SweepMessage(run_id=run_id, country="FR", provider_id=provider)


async def sweep(
    database: Database,
    fake_time: FakeTime,
    run_id: int,
    lists: dict[str, list[int]],
    provider: int = SERVICE,
    **options: Any,
) -> Discover:
    transport = Discover(lists, provider_id=provider, **options)
    outcome = await run_sweep(
        database, tmdb(transport, fake_time), step(run_id, provider), today=TODAY
    )
    assert outcome == Done()
    return transport


async def test_a_new_row_is_added(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    films = await add_films(restore, 3)
    run_id = await open_run(restore)

    await sweep(
        database,
        fake_time,
        run_id,
        {"flatrate": films[:1], "free": films[1:2], "ads": films[2:]},
    )

    assert await offers(restore) == {
        films[0]: {"subscription"},
        films[1]: {"free"},
        films[2]: {"ads"},
    }
    cur = await restore.execute(
        "select count(*) from public.title_availability a"
        " join public.ingest_runs r on r.id = %s"
        " where a.provider_id = %s and a.checked_at >= r.started_at",
        (run_id, SERVICE),
    )
    assert (await cur.fetchone()) == (3,)


async def test_an_unseen_row_is_deleted_after_a_complete_step(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    films = await add_films(restore, 10)
    await add_offers(restore, films)
    other = await add_films(restore, 1, start=500)
    await add_offers(restore, other, provider=OTHER)  # another service is none of its business
    run_id = await open_run(restore)

    await sweep(database, fake_time, run_id, {"flatrate": films[1:]})  # 10%: under the guard

    assert sorted(await offers(restore)) == films[1:]
    assert sorted(await offers(restore, OTHER)) == other
    stats = await run_stats(restore, run_id)
    assert stats["rows_deleted"] == 1
    assert "guard_trips" not in stats


async def test_a_step_that_failed_midway_deletes_nothing(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    old = await add_films(restore, 10)
    await add_offers(restore, old)
    new = await add_films(restore, 60, start=100)
    run_id = await open_run(restore)
    transport = Discover(
        {"flatrate": new}, provider_id=SERVICE, fail=("flatrate", 2)
    )  # page 1 is fine, page 2 is down

    with pytest.raises(TmdbRetryLater):
        await run_sweep(database, tmdb(transport, fake_time), step(run_id), today=TODAY)

    assert sorted(await offers(restore)) == old  # nothing deleted, nothing half-added
    stats = await run_stats(restore, run_id)
    assert not stats["_finished"]
    assert stats["_cursor"]["done"] == []


async def test_a_sweep_that_cannot_be_split_far_enough_deletes_nothing_and_counts_an_error(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    old = await add_films(restore, 10)
    await add_offers(restore, old)
    run_id = await open_run(restore)
    crowd = [FIRST + 700 + i for i in range(501)]  # one release year with over 500 pages
    transport = Discover(
        {"flatrate": crowd}, provider_id=SERVICE, page_size=1, year_of=dict.fromkeys(crowd, 1999)
    )

    outcome = await run_sweep(database, tmdb(transport, fake_time), step(run_id), today=TODAY)

    assert outcome == Done()
    assert sorted(await offers(restore)) == old
    stats = await run_stats(restore, run_id)
    assert stats["sweeps_incomplete"] == 1
    assert stats["_errors"] == 1
    assert stats["_finished"]  # the step is over: tomorrow's sweep tries again


async def test_a_21_percent_removal_is_refused_and_recorded_and_19_percent_is_applied(
    database: Database,
    restore: AsyncConnection,
    fake_time: FakeTime,
    caplog: pytest.LogCaptureFixture,
):
    glitch = await add_films(restore, 100)
    await add_offers(restore, glitch)
    fine = await add_films(restore, 100, start=200)
    await add_offers(restore, fine, provider=OTHER)
    glitch_run = await open_run(restore)

    with caplog.at_level(logging.ERROR):
        await sweep(database, fake_time, glitch_run, {"flatrate": glitch[:79]})
    await sweep(
        database, fake_time, await open_run(restore), {"flatrate": fine[:81]}, provider=OTHER
    )

    assert sorted(await offers(restore)) == glitch  # 21 would go: nothing does
    assert sorted(await offers(restore, OTHER)) == fine[:81]  # 19 go
    stats = await run_stats(restore, glitch_run)
    assert stats["guard_trips"] == 1
    assert stats[f"guard_refused_FR_{SERVICE}"] == 21
    assert "rows_deleted" not in stats or stats["rows_deleted"] == 0
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors, "a guard trip is logged as an error"
    assert str(SERVICE) in errors[0].getMessage()


async def test_exactly_20_percent_is_applied(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    films = await add_films(restore, 100)
    await add_offers(restore, films)

    await sweep(database, fake_time, await open_run(restore), {"flatrate": films[:80]})

    assert sorted(await offers(restore)) == films[:80]


async def test_a_refused_removal_still_adds_what_was_seen(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    old = await add_films(restore, 10)
    await add_offers(restore, old)
    new = await add_films(restore, 2, start=100)

    await sweep(database, fake_time, await open_run(restore), {"flatrate": new})  # all 10 unseen

    assert sorted(await offers(restore)) == old + new


async def test_unknown_films_are_queued_once_for_a_fetch_with_reason_sweep(
    database: Database, restore: AsyncConnection, admin: AsyncConnection, fake_time: FakeTime
):
    known = await add_films(restore, 1)
    unknown = [FIRST + 900 + i for i in range(250)]
    run_id = await open_run(restore)
    lists = {"flatrate": known + unknown, "ads": unknown[:5]}  # five films in two kinds

    await sweep(database, fake_time, run_id, lists)

    messages = await queued(admin)
    assert [len(m["tmdb_ids"]) for m in messages] == [100, 100, 50]
    assert {m["kind"] for m in messages} == {"fetch"}
    assert {m["reason"] for m in messages} == {"sweep"}
    assert {m["run_id"] for m in messages} == {run_id}
    queued_ids = [i for m in messages for i in m["tmdb_ids"]]
    assert sorted(queued_ids) == unknown  # each once, and not the known film
    assert (await run_stats(restore, run_id))["films_queued"] == 250

    # Another service sees the same films while the fetches still wait: they are not queued again.
    await sweep(database, fake_time, await open_run(restore), lists, provider=OTHER)
    assert len(await queued(admin)) == 3


async def test_running_a_step_twice_is_a_no_op(
    database: Database, restore: AsyncConnection, admin: AsyncConnection, fake_time: FakeTime
):
    old = await add_films(restore, 10)
    await add_offers(restore, old)
    new = await add_films(restore, 2, start=100)
    unknown = [FIRST + 900, FIRST + 901]
    run_id = await open_run(restore, steps=2)  # still open after the first run of the step
    lists = {"flatrate": old[1:] + new + unknown}

    await sweep(database, fake_time, run_id, lists)
    first = await offers(restore)
    first_stats = await run_stats(restore, run_id)
    first_queue = await queued(admin)
    first_tiers = await tiers(restore)
    await sweep(database, fake_time, run_id, lists)

    assert await offers(restore) == first
    assert await tiers(restore) == first_tiers
    after = await run_stats(restore, run_id)
    assert {k: v for k, v in after.items() if k != "_cursor"} == {
        k: v for k, v in first_stats.items() if k != "_cursor"
    }  # the second run adds nothing to the counts
    assert await queued(admin) == first_queue


async def test_a_films_tier_flips_when_its_last_offer_goes_and_when_its_first_arrives(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    films = await add_films(restore, 12, start=300, tier=1)
    await add_offers(restore, films[:11])  # tier 1, one offer each on SERVICE
    await add_offers(restore, [films[1]], provider=OTHER)  # films[1] has a second service
    (waiting,) = await add_films(restore, 1, start=400, tier=2)
    run_id = await open_run(restore)

    # films[0] is not seen and loses its only offer; films[1] loses one but keeps the other;
    # the film with no offer yet is seen and gains one.
    seen = films[2:11] + [waiting]
    await sweep(database, fake_time, run_id, {"flatrate": seen})

    now = await tiers(restore)
    assert now[films[0]] == 2
    assert now[films[1]] == 1
    assert now[waiting] == 1
    assert now[films[11]] == 1  # not touched, not changed


async def test_the_run_ends_when_its_last_step_is_in_and_counts_each_step_once(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    first = await add_films(restore, 2)
    second = await add_films(restore, 3, start=100)
    run_id = await open_run(restore, steps=2)

    await sweep(database, fake_time, run_id, {"flatrate": first})
    assert not (await run_stats(restore, run_id))["_finished"]
    await sweep(database, fake_time, run_id, {"ads": second}, provider=OTHER)
    await sweep(database, fake_time, run_id, {"ads": second}, provider=OTHER)  # redelivered

    stats = await run_stats(restore, run_id)
    assert stats["_finished"]
    assert stats["rows_added"] == 5
    assert sorted(stats["_cursor"]["done"]) == sorted([f"FR:{SERVICE}", f"FR:{OTHER}"])


async def test_a_step_for_a_service_that_is_no_longer_swept_changes_nothing(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    films = await add_films(restore, 3)
    await add_offers(restore, films)
    await restore.execute(
        "update public.provider_regions set is_listed = false where provider_id = %s", (SERVICE,)
    )
    run_id = await open_run(restore)
    transport = Discover({"flatrate": []}, provider_id=SERVICE)

    outcome = await run_sweep(database, tmdb(transport, fake_time), step(run_id), today=TODAY)

    assert outcome == Done()
    assert transport.requests == []
    assert sorted(await offers(restore)) == films


async def test_a_step_of_an_unknown_run_is_rejected(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    from server.workers.runner import Reject

    transport = Discover({}, provider_id=SERVICE)
    outcome = await run_sweep(
        database, tmdb(transport, fake_time), step(2_000_000_000), today=TODAY
    )
    assert isinstance(outcome, Reject)


async def test_the_job_opens_a_run_and_sends_one_step_per_country_and_swept_service(
    database: Database, restore: AsyncConnection, admin: AsyncConnection
):
    await restore.execute(
        "insert into public.providers (id, name, parent_id) values (60000103, 'Invented', %s)",
        (SERVICE,),
    )  # a variant of a listed service is swept
    await restore.execute(
        "insert into public.provider_regions (provider_id, country) values (60000103, 'FR')"
    )
    await restore.execute("insert into public.providers (id, name) values (60000104, 'Invented')")
    await restore.execute(  # in France, neither listed nor free nor a variant: not swept
        "insert into public.provider_regions (provider_id, country) values (60000104, 'FR')"
    )

    outcome = await run_availability_sweep(database)

    assert outcome == Done()
    cur = await admin.execute(
        "select id, cursor from public.ingest_runs where kind = 'availability_sweep'"
        " order by id desc limit 1"
    )
    run_id, cursor = (await cur.fetchone()) or (0, {})
    messages = [m for m in await queued(admin) if m["kind"] == "sweep"]
    assert {m["run_id"] for m in messages} == {run_id}
    assert {m["country"] for m in messages} == {"FR"}
    providers = [m["provider_id"] for m in messages]
    assert len(providers) == len(set(providers)) == cursor["steps"]
    assert {SERVICE, OTHER, 60000103} <= set(providers)
    assert 60000104 not in providers
    assert cursor["done"] == []
    assert not (await run_stats(admin, run_id))["_finished"]


async def test_a_step_that_comes_back_after_a_crash_mends_the_tiers(
    database: Database, restore: AsyncConnection, fake_time: FakeTime
):
    # The first attempt added the offer and died before the tiers were redone: the film is
    # still tier 2 although it has an offer, and the offer is no longer new.
    (gained,) = await add_films(restore, 1, tier=2)
    run_id = await open_run(restore, steps=2)
    await add_offers(restore, [gained], days_old=0)

    await sweep(database, fake_time, run_id, {"flatrate": [gained]})

    assert (await tiers(restore))[gained] == 1


async def test_a_failing_tier_refresh_rolls_the_delete_back(
    database: Database,
    restore: AsyncConnection,
    fake_time: FakeTime,
    monkeypatch: pytest.MonkeyPatch,
):
    from server.db import queries

    films = await add_films(restore, 10)
    await add_offers(restore, films)
    run_id = await open_run(restore)
    real = queries.load

    def broken(name: str) -> Any:
        return "select 1/0 from unnest(%s::bigint[])" if name == "refresh_tiers" else real(name)

    monkeypatch.setattr(queries, "load", broken)
    transport = Discover({"flatrate": films[1:]}, provider_id=SERVICE)
    with pytest.raises(Exception, match="division by zero"):
        await run_sweep(database, tmdb(transport, fake_time), step(run_id), today=TODAY)
    monkeypatch.undo()

    assert sorted(await offers(restore)) == films  # the unseen offer is still there


async def test_two_steps_dropping_the_last_two_offers_of_a_film_leave_it_at_tier_2(
    database: Database, restore: AsyncConnection, fake_time: FakeTime, pipeline_url: SecretStr
):
    import asyncio

    from psycopg import AsyncConnection as Conn
    from tests.contract.conftest import ADMIN_URL

    films = await add_films(restore, 10)
    await add_offers(restore, films)  # on SERVICE
    await add_offers(restore, films[:1], provider=OTHER)  # films[0] is also on OTHER
    run_id = await open_run(restore, steps=2)

    # The other step, still open: it has deleted OTHER's offer of films[0] and holds the film's
    # row lock, but has not committed.
    async with await Conn.connect(ADMIN_URL, autocommit=False) as other:
        await other.execute(
            "select id from public.titles where tmdb_id = %s for no key update", (films[0],)
        )
        await other.execute(
            "delete from public.title_availability a using public.titles t"
            " where t.id = a.title_id and t.tmdb_id = %s and a.provider_id = %s",
            (films[0], OTHER),
        )
        transport = Discover({"flatrate": films[1:]}, provider_id=SERVICE)
        task = asyncio.create_task(
            run_sweep(database, tmdb(transport, fake_time), step(run_id), today=TODAY)
        )
        for _ in range(200):  # wait until the sweep is queued behind the lock
            cur = await restore.execute(
                "select count(*) from pg_stat_activity"
                " where wait_event_type = 'Lock' and query ilike '%%for no key update%%'"
            )
            row = await cur.fetchone()
            if row and row[0]:
                break
            await asyncio.sleep(0.05)
        else:
            task.cancel()
            raise AssertionError("the sweep did not wait for the film's lock")
        await other.commit()
        assert await task == Done()

    assert (await tiers(restore))[films[0]] == 2
