# ruff: noqa: F811  (the fixtures are imported from test_fetch_job and used by name)
"""Poster placeholders against the real schema, as flimme_pipeline (M2.8).

TMDB and the image host are replayed: films come from the synthetic fixture and posters are
generated in code. The local database is shared and holds the seed, so the gap pass test
restores every placeholder it writes outside the invented id range.
"""

from collections.abc import AsyncIterator

import httpx
import pytest
from psycopg import AsyncConnection
from tests.contract.test_fetch_job import (  # noqa: F401  (fixtures)
    MOVIE,
    database,
    full,
    message,
    new_run,
    restore,
    rows,
    serve,
)
from tests.unit.test_placeholders import poster_bytes

from server.catalog.fetch import run_fetch
from server.catalog.placeholders import Posters, fill_missing_placeholders, thumbhash
from server.db.pool import Database

pytestmark = pytest.mark.anyio

FIRST_PATH = "/fixture-poster-en.jpg"
SECOND_PATH = "/fixture-poster-new.jpg"


class PosterHost:
    """A fake image host: bytes per path (a status code for a failure), and a log of requests."""

    def __init__(self, pictures: dict[str, bytes | int]) -> None:
        self.pictures = pictures
        self.paths: list[str] = []

    def posters(self) -> Posters:
        def handler(request: httpx.Request) -> httpx.Response:
            self.paths.append(request.url.path.removeprefix("/t/p/w92"))
            reply = self.pictures[self.paths[-1]]
            if isinstance(reply, int):
                return httpx.Response(reply)
            return httpx.Response(200, content=reply)

        return Posters(transport=httpx.MockTransport(handler))


async def stored_placeholder(conn: AsyncConnection) -> str | None:
    ((value,),) = await rows(
        conn, "select poster_placeholder from public.titles where tmdb_id = %s", MOVIE
    )
    return value


def with_poster(path: str):
    def mutate(body: dict) -> None:
        body["poster_path"] = path

    return mutate


async def fetch(
    database: Database, conn, transport_class, fake_time, host: PosterHost, response
) -> dict:
    tmdb, _ = serve(transport_class, fake_time, {MOVIE: response})
    run_id = await new_run(conn)
    posters = host.posters()
    await run_fetch(database, tmdb, message(run_id, MOVIE), posters)
    await posters.aclose()
    ((stats,),) = await rows(conn, "select stats from public.ingest_runs where id = %s", run_id)
    return stats


async def test_a_new_film_gets_the_placeholder_of_its_w92_poster(
    database, restore, transport_class, fake_time
):
    host = PosterHost({FIRST_PATH: poster_bytes()})

    stats = await fetch(database, restore, transport_class, fake_time, host, full())

    assert await stored_placeholder(restore) == thumbhash(poster_bytes())
    assert host.paths == [FIRST_PATH]
    assert stats["placeholders_made"] == 1


async def test_an_unchanged_poster_path_makes_no_download(
    database, restore, transport_class, fake_time
):
    host = PosterHost({FIRST_PATH: poster_bytes()})
    await fetch(database, restore, transport_class, fake_time, host, full())

    stats = await fetch(database, restore, transport_class, fake_time, host, full())

    assert host.paths == [FIRST_PATH]  # the first fetch's only
    assert "placeholders_made" not in stats
    assert await stored_placeholder(restore) == thumbhash(poster_bytes())


async def test_a_changed_poster_path_recomputes_the_placeholder(
    database, restore, transport_class, fake_time
):
    other = poster_bytes(shift=90)
    host = PosterHost({FIRST_PATH: poster_bytes(), SECOND_PATH: other})
    await fetch(database, restore, transport_class, fake_time, host, full())

    await fetch(database, restore, transport_class, fake_time, host, full(with_poster(SECOND_PATH)))

    assert host.paths == [FIRST_PATH, SECOND_PATH]
    assert await stored_placeholder(restore) == thumbhash(other)


async def test_a_failed_download_keeps_the_old_value_and_counts_an_error(
    database, restore, transport_class, fake_time
):
    host = PosterHost({FIRST_PATH: poster_bytes(), SECOND_PATH: 503})
    await fetch(database, restore, transport_class, fake_time, host, full())

    stats = await fetch(
        database, restore, transport_class, fake_time, host, full(with_poster(SECOND_PATH))
    )

    assert await stored_placeholder(restore) == thumbhash(poster_bytes())
    assert stats["placeholder_errors"] == 1
    # The film itself was still written, with its new path.
    ((path,),) = await rows(
        restore, "select poster_path from public.titles where tmdb_id = %s", MOVIE
    )
    assert path == SECOND_PATH


@pytest.fixture
async def seed_untouched(restore: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    """The gap pass reaches every film, the seed's too: put their placeholders back after."""
    cur = await restore.execute(
        "select id, poster_placeholder from public.titles"
        " where tmdb_id not between 60000000 and 60000999"
    )
    before = await cur.fetchall()
    try:
        yield restore
    finally:
        for title_id, placeholder in before:
            await restore.execute(
                "update public.titles set poster_placeholder = %s where id = %s",
                (placeholder, title_id),
            )


async def test_the_pass_fills_every_gap(database, seed_untouched):
    conn = seed_untouched
    for tmdb_id, path in ((60000501, "/a.jpg"), (60000502, "/b.jpg"), (60000503, "/gone.jpg")):
        await conn.execute(
            "insert into public.titles (tmdb_id, original_title, poster_path)"
            " values (%s, 'Invented', %s)",
            (tmdb_id, path),
        )
    await conn.execute(
        "insert into public.titles (tmdb_id, original_title) values (60000504, 'No poster')"
    )
    await conn.execute(
        "insert into public.titles (tmdb_id, original_title, poster_path, poster_placeholder)"
        " values (60000505, 'Done', '/done.jpg', 'keepme')"
    )
    host = PosterHost(
        {"/a.jpg": poster_bytes(), "/b.jpg": poster_bytes(shift=40), "/gone.jpg": 404}
    )
    # Every poster the seed holds answers with a picture.
    cur = await conn.execute(
        "select distinct poster_path from public.titles"
        " where poster_path is not null and tmdb_id not between 60000000 and 60000999"
    )
    for (path,) in await cur.fetchall():
        host.pictures.setdefault(path, poster_bytes(shift=7))
    posters = host.posters()

    result = await fill_missing_placeholders(database, posters, chunk=2)
    await posters.aclose()

    assert result.errors == 1
    got = dict(
        await rows(
            conn,
            "select tmdb_id, poster_placeholder from public.titles"
            " where tmdb_id between 60000501 and 60000505",
        )
    )
    assert got[60000501] == thumbhash(poster_bytes())
    assert got[60000502] == thumbhash(poster_bytes(shift=40))
    assert got[60000503] is None  # failed, counted, tried again next time
    assert got[60000504] is None  # no poster, nothing to show
    assert got[60000505] == "keepme"  # never recomputed
    ((missing,),) = await rows(
        conn,
        "select count(*) from public.titles where poster_path is not null"
        " and poster_placeholder is null and tmdb_id <> 60000503",
    )
    assert missing == 0
    assert result.set == len([p for p in host.paths if p != "/gone.jpg"])


async def test_a_film_whose_download_failed_gets_its_placeholder_on_a_later_fetch(
    database, restore, transport_class, fake_time
):
    host = PosterHost({FIRST_PATH: 503})
    await fetch(database, restore, transport_class, fake_time, host, full())
    assert await stored_placeholder(restore) is None
    host.pictures[FIRST_PATH] = poster_bytes()

    await fetch(database, restore, transport_class, fake_time, host, full())

    assert await stored_placeholder(restore) == thumbhash(poster_bytes())
