"""The film fetch against the real schema, as flimme_pipeline (M2.7).

TMDB is replayed from a synthetic fixture. The local database is shared and holds the seed, so
every test works with invented ids (movies 60,000,010 up, services 60,000,201 up, people
97,000,000 up, keywords 98,000,000 up) and the `restore` fixture removes whatever it added.
"""

import copy
import dataclasses
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.conftest import FakeTime, FixtureTransport, fixture_json
from tests.contract.conftest import open_database

from server.catalog.fetch import CreditRow, _write, build_film_rows, load_context, run_fetch
from server.catalog.tmdb import TmdbClient, TmdbRetryLater
from server.db.payloads import FetchMessage
from server.db.pool import Database

pytestmark = pytest.mark.anyio

MOVIE = 60_000_010
LISTED, FREE, VARIANT, UNSWEPT = 60_000_201, 60_000_202, 60_000_203, 60_000_299


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def restore(admin: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    """Four services in France (listed, free, a variant of the listed one, none of those),
    and cleanup of everything a test adds."""
    cur = await admin.execute("select coalesce(max(id), 0) from public.ingest_runs")
    row = await cur.fetchone()
    assert row is not None
    last_run = row[0]
    for provider in (LISTED, FREE, VARIANT, UNSWEPT):
        await admin.execute(
            "insert into public.providers (id, name) values (%s, 'Invented')", (provider,)
        )
        await admin.execute(
            "insert into public.provider_regions (provider_id, country) values (%s, 'FR')",
            (provider,),
        )
    await admin.execute(
        "update public.provider_regions set is_listed = true where provider_id = %s", (LISTED,)
    )
    await admin.execute(
        "update public.provider_regions set free_for_all = true where provider_id = %s", (FREE,)
    )
    await admin.execute(
        "update public.providers set parent_id = %s where id = %s", (LISTED, VARIANT)
    )
    try:
        yield admin
    finally:
        await admin.execute("delete from public.ingest_runs where id > %s", (last_run,))
        await admin.execute("delete from public.titles where tmdb_id between 60000000 and 60000999")
        await admin.execute("delete from public.people where id >= 97000000")
        await admin.execute("delete from public.keywords where id >= 98000000")
        await admin.execute("delete from public.certification_ages where country = 'US'")
        await admin.execute("delete from public.countries where code = 'US'")
        await admin.execute(
            "update public.providers set parent_id = null where id = %s", (VARIANT,)
        )
        await admin.execute("delete from public.providers where id >= 60000200")


def serve(
    transport_class: type[FixtureTransport],
    fake_time: FakeTime,
    replies: dict[int, Any],
) -> tuple[TmdbClient, FixtureTransport]:
    """A client whose `/movie/<id>` answers come from `replies` (a response, or an exception)."""
    script = {f"/movie/{movie_id}": [reply] for movie_id, reply in replies.items()}
    transport = transport_class(script, clock=fake_time.clock)
    client = TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)
    return client, transport


def full(mutate: Any = None) -> httpx.Response:
    body = copy.deepcopy(fixture_json("tmdb/movie_full_60000010.json"))
    if mutate is not None:
        mutate(body)
    return httpx.Response(200, json=body)


def not_found() -> httpx.Response:
    return httpx.Response(404, json=fixture_json("tmdb/not_found.json"))


async def new_run(conn: AsyncConnection) -> int:
    cur = await conn.execute(
        "insert into public.ingest_runs (kind) values ('details_weekly') returning id"
    )
    row = await cur.fetchone()
    assert row is not None
    return row[0]


def message(run_id: int, *ids: int) -> FetchMessage:
    return FetchMessage(run_id=run_id, tmdb_ids=list(ids), reason="weekly")


async def rows(conn: AsyncConnection, query: str, *args: Any) -> list[tuple[Any, ...]]:
    cur = await conn.execute(query, args)  # type: ignore[arg-type]
    return await cur.fetchall()


async def snapshot(conn: AsyncConnection) -> list[Any]:
    """Every row a fetch writes for the film, without the timestamps and generated ids."""
    where = "from public.titles t where t.tmdb_id = %s"
    out: list[Any] = []
    for query in (
        "select tmdb_id, imdb_id, original_title, original_language, release_date, runtime_min,"
        " genre_ids, keyword_ids, collection_id, popularity, vote_average, vote_count,"
        " poster_path, backdrop_path, trailer_key, is_adult, is_active, refresh_tier,"
        f" tmdb_missing_since {where}",
        "select language, title, overview, tagline, poster_path from public.title_translations"
        " where title_id = (select id from public.titles where tmdb_id = %s) order by 1",
        "select person_id, role, character_name, ord from public.title_credits"
        " where title_id = (select id from public.titles where tmdb_id = %s) order by 1, 2",
        "select country, certification, min_age, inferred_from from public.title_certifications"
        " where title_id = (select id from public.titles where tmdb_id = %s) order by 1",
        "select country, provider_id, kind::text from public.title_availability"
        " where title_id = (select id from public.titles where tmdb_id = %s) order by 1, 2, 3",
        "select country, tmdb_link from public.title_watch_links"
        " where title_id = (select id from public.titles where tmdb_id = %s) order by 1",
        "select id, name from public.keywords where id >= 98000000 order by 1",
        "select id, name, profile_path from public.people where id >= 97000000 order by 1",
    ):
        out.append(await rows(conn, query, MOVIE) if "%s" in query else await rows(conn, query))
    return out


async def test_a_full_response_fills_every_table_it_should(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, transport = serve(transport_class, fake_time, {MOVIE: full()})

    await run_fetch(database, tmdb, message(run_id, MOVIE))

    # One request for the film, with every part appended.
    assert len(transport.requests) == 1
    params = dict(transport.requests[0].url.params)
    assert params == {
        "language": "en-US",
        "append_to_response": (
            "translations,keywords,credits,release_dates,videos,watch/providers,images"
        ),
        "include_image_language": "fr,en,null",
    }

    (title,) = await rows(
        restore,
        "select imdb_id, original_title, original_language, release_date, runtime_min, genre_ids,"
        " keyword_ids, collection_id, vote_average, vote_count, poster_path, backdrop_path,"
        " trailer_key, is_adult, is_active, refresh_tier, tmdb_missing_since is null,"
        " quality_score is not null, refreshed_at is not null"
        " from public.titles where tmdb_id = %s",
        MOVIE,
    )
    assert title[:3] == ("tt9000010", "Film invente dix", "fr")
    assert str(title[3]) == "2019-06-05" and title[4] == 104
    assert title[5] == [18, 35] and title[6] == [98000001, 98000002] and title[7] == 98000900
    assert title[8:12] == (
        pytest.approx(7.4),
        1250,
        "/fixture-poster-en.jpg",
        "/fixture-backdrop.jpg",
    )
    assert title[12:] == ("trailerEn001", False, True, 1, True, True, True)

    snap = await snapshot(restore)
    assert snap[1] == [
        (
            "en",
            "Invented film ten",
            "An invented English overview.",
            "An invented English tagline.",
            None,
        ),
        (
            "fr",
            "Film invente dix",
            "Un resume invente de France.",
            None,
            "/fixture-poster-fr-best.jpg",
        ),
    ]
    credits = snap[2]
    assert sorted(r[1] for r in credits) == ["cast"] * 8 + ["director"] * 2 + ["writer"] * 3
    assert snap[3] == [("FR", "12", 12, None)]
    assert snap[4] == [
        ("FR", LISTED, "subscription"),
        ("FR", FREE, "ads"),
        ("FR", FREE, "free"),
        ("FR", VARIANT, "subscription"),
    ]
    assert snap[5] == [("FR", "https://www.example.invalid/watch/fr/60000010")]
    assert [k[0] for k in snap[6]] == [98000001, 98000002]
    assert len(snap[7]) == 13  # 2 directors + 3 writers + 8 cast

    (run,) = await rows(
        restore,
        "select titles_touched, errors, stats from public.ingest_runs where id = %s",
        run_id,
    )
    assert run[0] == 1 and run[1] == 0
    assert run[2]["films_written"] == 1


async def test_the_quality_score_uses_the_catalog_average_computed_in_sql(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    average = await rows(
        restore,
        "select avg(vote_average)::float8 from public.titles"
        " where is_active and not is_adult and vote_count >= 30",
    )
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})

    await run_fetch(database, tmdb, message(await new_run(restore), MOVIE))

    ((score,),) = await rows(
        restore, "select quality_score from public.titles where tmdb_id = %s", MOVIE
    )
    # The film's own row is left out of the average, so a rerun gives the same score.
    assert score == pytest.approx((1250 / 1350) * 7.4 + (100 / 1350) * average[0][0], abs=1e-4)


async def test_running_the_same_message_twice_leaves_identical_rows(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})
    await run_fetch(database, tmdb, message(run_id, MOVIE))
    first = await snapshot(restore)
    (score,) = (
        await rows(restore, "select quality_score from public.titles where tmdb_id = %s", MOVIE)
    )[0]

    await run_fetch(database, tmdb, message(run_id, MOVIE))

    assert await snapshot(restore) == first
    assert (
        await rows(restore, "select quality_score from public.titles where tmdb_id = %s", MOVIE)
    )[0] == (score,)


async def test_a_credit_removed_upstream_disappears(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    def drop_a_writer_and_the_last_actor(body: dict[str, Any]) -> None:
        body["credits"]["crew"] = [c for c in body["credits"]["crew"] if c["id"] != 97000012]
        body["credits"]["cast"] = [c for c in body["credits"]["cast"] if c["order"] != 7]

    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full(drop_a_writer_and_the_last_actor)})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    people = {
        r[0]
        for r in await rows(
            restore,
            "select person_id from public.title_credits"
            " where title_id = (select id from public.titles where tmdb_id = %s)",
            MOVIE,
        )
    }
    assert 97000012 not in people and 97000107 not in people
    # The writer who was fourth in the list now makes the three.
    assert {97000011, 97000013, 97000014} <= people


async def test_offers_removed_upstream_disappear_and_the_watch_link_follows(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    def lose_everything(body: dict[str, Any]) -> None:
        body["watch/providers"]["results"] = {}

    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full(lose_everything)})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    snap = await snapshot(restore)
    assert snap[4] == [] and snap[5] == []
    assert snap[0][0][17] == 2  # no offers left: tier 2


async def test_a_disagreement_with_the_sweep_is_counted_and_the_film_answer_wins(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    await restore.execute(
        "insert into public.titles (tmdb_id, original_title) values (%s, 'Before')", (MOVIE,)
    )
    await restore.execute(
        "insert into public.title_availability (title_id, country, provider_id, kind)"
        " select id, 'FR', p, 'subscription' from public.titles, unnest(%s::int[]) p"
        " where tmdb_id = %s",
        ([LISTED, FREE], MOVIE),
    )
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})

    await run_fetch(database, tmdb, message(run_id, MOVIE))

    # The sweep had {listed/subscription, free/subscription}; the film says {listed/subscription,
    # free/free, free/ads, variant/subscription}. Four differ out of five compared.
    (run,) = await rows(restore, "select stats from public.ingest_runs where id = %s", run_id)
    assert run[0]["availability_disagreements"] == 4
    assert run[0]["offers_compared"] == 5
    snap = await snapshot(restore)
    assert [(r[1], r[2]) for r in snap[4]] == [
        (LISTED, "subscription"),
        (FREE, "ads"),
        (FREE, "free"),
        (VARIANT, "subscription"),
    ]


async def test_a_new_film_is_not_a_disagreement(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})

    await run_fetch(database, tmdb, message(run_id, MOVIE))

    (run,) = await rows(restore, "select stats from public.ingest_runs where id = %s", run_id)
    assert run[0].get("availability_disagreements", 0) == 0


async def test_a_404_deactivates_the_film_and_a_later_success_brings_it_back(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    tmdb, _ = serve(transport_class, fake_time, {MOVIE: not_found()})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    ((active, missing),) = await rows(
        restore,
        "select is_active, tmdb_missing_since from public.titles where tmdb_id = %s",
        MOVIE,
    )
    assert active is False and missing is not None
    # Its content stays for six months: the rows are still there.
    assert len((await snapshot(restore))[2]) == 13

    await run_fetch(database, tmdb, message(run_id, MOVIE))
    ((_, still_missing),) = await rows(
        restore, "select is_active, tmdb_missing_since from public.titles where tmdb_id = %s", MOVIE
    )
    assert still_missing == missing  # set once, kept while it stays missing

    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})
    await run_fetch(database, tmdb, message(run_id, MOVIE))

    assert await rows(
        restore,
        "select is_active, tmdb_missing_since from public.titles where tmdb_id = %s",
        MOVIE,
    ) == [(True, None)]
    (run,) = await rows(restore, "select stats from public.ingest_runs where id = %s", run_id)
    assert run[0]["films_not_found"] == 2


async def test_a_404_for_a_film_we_never_had_writes_nothing(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: not_found()})

    await run_fetch(database, tmdb, message(run_id, MOVIE))

    assert await rows(restore, "select 1 from public.titles where tmdb_id = %s", MOVIE) == []


async def test_a_film_that_cannot_be_read_is_counted_and_the_others_still_go_through(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    broken = 60_000_011
    run_id = await new_run(restore)
    tmdb, _ = serve(
        transport_class,
        fake_time,
        {broken: httpx.Response(200, json={"id": broken, "title": 12}), MOVIE: full()},
    )

    await run_fetch(database, tmdb, message(run_id, broken, MOVIE))

    assert len(await rows(restore, "select 1 from public.titles where tmdb_id = %s", MOVIE)) == 1
    assert await rows(restore, "select 1 from public.titles where tmdb_id = %s", broken) == []
    (run,) = await rows(
        restore,
        "select titles_touched, errors, stats from public.ingest_runs where id = %s",
        run_id,
    )
    assert run[0] == 1 and run[1] == 1 and run[2]["films_failed"] == 1


async def test_tmdb_asking_us_to_come_back_leaves_the_message_to_be_retried(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: httpx.Response(503, json={})})

    with pytest.raises(TmdbRetryLater):
        await run_fetch(database, tmdb, message(run_id, MOVIE))

    assert await rows(restore, "select 1 from public.titles where tmdb_id = %s", MOVIE) == []


async def test_a_missing_french_certification_uses_the_us_one(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    await restore.execute("insert into public.countries (code) values ('US')")
    await restore.execute(
        "insert into public.certification_ages (country, certification, min_age)"
        " values ('US', 'PG-13', 13)"
    )

    def only_us(body: dict[str, Any]) -> None:
        body["release_dates"]["results"] = [
            r for r in body["release_dates"]["results"] if r["iso_3166_1"] == "US"
        ]

    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full(only_us)})

    await run_fetch(database, tmdb, message(await new_run(restore), MOVIE))

    assert (await snapshot(restore))[3] == [("FR", "PG-13", 13, "US")]


# --- The floor (M2.9): a candidate or sweep fetch below it is not stored (decision Q19).


def candidate(run_id: int, *ids: int, reason: str = "candidate") -> FetchMessage:
    return FetchMessage(run_id=run_id, tmdb_ids=list(ids), reason=reason)  # type: ignore[arg-type]


def too_short(body: dict[str, Any]) -> None:
    body["runtime"] = 39


async def stored(conn: AsyncConnection, tmdb_id: int) -> list[tuple[Any, ...]]:
    return await rows(
        conn, "select is_active, vote_count from public.titles where tmdb_id = %s", tmdb_id
    )


@pytest.mark.parametrize("reason", ["candidate", "sweep"])
async def test_a_candidate_under_the_floor_is_not_stored(
    reason: str, database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full(too_short)})

    await run_fetch(database, tmdb, candidate(run_id, MOVIE, reason=reason))

    assert await stored(restore, MOVIE) == []
    assert await rows(
        restore,
        "select count(*) from public.title_translations where title_id"
        " in (select id from public.titles where tmdb_id = %s)",
        MOVIE,
    ) == [(0,)]
    (stats,) = await rows(
        restore,
        "select stats, titles_touched, errors from public.ingest_runs where id = %s",
        run_id,
    )
    assert stats[0]["films_below_floor"] == 1 and stats[0]["floor_too_short"] == 1
    assert "films_written" not in stats[0] and stats[1] == 0 and stats[2] == 0


@pytest.mark.parametrize("reason", ["changes", "weekly", "monthly"])
async def test_the_floor_only_judges_new_candidates_not_refreshes(
    reason: str, database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full(too_short)})

    await run_fetch(database, tmdb, candidate(run_id, MOVIE, reason=reason))

    assert await stored(restore, MOVIE) == [(True, 1250)]


async def test_a_film_already_stored_is_never_removed_by_the_floor(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    run_id = await new_run(restore)
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full()})
    await run_fetch(database, tmdb, candidate(run_id, MOVIE))
    assert await stored(restore, MOVIE) == [(True, 1250)]

    # Its votes fall under the floor; the film stays, refreshed, and stays active.
    def few_votes(body: dict[str, Any]) -> None:
        body["vote_count"] = 3

    tmdb, _ = serve(transport_class, fake_time, {MOVIE: full(few_votes)})
    await run_fetch(database, tmdb, candidate(run_id, MOVIE))

    assert await stored(restore, MOVIE) == [(True, 3)]
    (stats,) = await rows(restore, "select stats from public.ingest_runs where id = %s", run_id)
    assert "films_below_floor" not in stats[0]


async def test_a_message_keeps_the_films_that_pass_and_drops_the_ones_that_do_not(
    database: Database, restore: AsyncConnection, transport_class, fake_time
):
    other = MOVIE + 1

    def renumber(body: dict[str, Any]) -> None:
        body["id"] = other

    run_id = await new_run(restore)
    tmdb, _ = serve(
        transport_class,
        fake_time,
        {MOVIE: full(), other: full(lambda b: (renumber(b), too_short(b)))},
    )

    await run_fetch(database, tmdb, candidate(run_id, MOVIE, other))

    assert await stored(restore, MOVIE) == [(True, 1250)]
    assert await stored(restore, other) == []


async def test_a_write_that_fails_halfway_rolls_back_the_whole_film(
    database: Database, restore: AsyncConnection
):
    context = await load_context(database, [MOVIE])
    film = build_film_rows(fixture_json("tmdb/movie_full_60000010.json"), context)
    # The last statements of the write fail on a credit for a person nobody stored; the film,
    # its keywords and the people sent before it must not stay.
    broken = dataclasses.replace(
        film, credits=(*film.credits, CreditRow(97_999_999, "cast", None, 99))
    )

    with pytest.raises(Exception, match="foreign key|violates"):
        async with database.connection() as conn, conn.transaction():
            await _write(conn, broken)

    assert await rows(restore, "select 1 from public.titles where tmdb_id = %s", MOVIE) == []
    assert await rows(restore, "select 1 from public.keywords where id >= 98000000") == []
    assert await rows(restore, "select 1 from public.people where id >= 97000000") == []
