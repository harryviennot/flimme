"""The daily availability sweep (`availability_sweep`, tmdb.md#the-daily-sweep).

Each night TMDB's discover lists, for one service in one country, every film offered by
subscription, free or with ads. That list is the truth for the service, and `title_availability`
is brought in line with it.

Two kinds of message, both safe to run twice:

- `job availability_sweep` opens an `ingest_runs` row and sends one `sweep` message per
  (enabled country, swept service). The swept set is the one the film fetch uses
  (`fetch.read_swept_set`): listed and free services and the variants of either.
- `sweep` reads the service's three offer kinds, every page, and only then writes:
  1. offers seen are added, and the ones already there get a fresh `checked_at`;
  2. when the sweep finished completely, offers not seen since the run began are deleted,
     unless that would remove more than 20% of the service's offers in the country: then
     nothing is deleted, the trip is recorded in the run's `stats` and logged as an error
     (M9.5 turns it into an alert). What was seen is still added: it is true either way;
  3. the tier of every film whose offers changed is recomputed;
  4. films the catalog does not hold are queued as `fetch` messages with reason `sweep`
     (100 to a message), unless they already wait in the queue.

"Completely" means every page of every query was read. A page that fails escapes as an
exception and the message comes back: nothing has been written by then, so a sweep that
stopped midway changes nothing. A query with more than 500 pages (TMDB serves no more) is
split by release year (films with no release date are not returned by a split query); a year
that is still over 500 pages cannot be read completely, which counts as an error and writes
nothing.

How long a step takes: a service has at most a few tens of thousands of films with 30 votes,
so a step makes a few thousand requests at the worst (20 pages of 20 films per 400 films, and
about 140 year queries per kind when split), which is minutes at the client's 20 a second, far
under the handler's 30 minute cap. One message per (country, service) is therefore enough.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, ValidationError

from server.catalog.fetch import MIN_VOTES, OFFER_KINDS, read_swept_set
from server.catalog.popularity import FETCH_BATCH, batches
from server.catalog.tmdb import NotFound, TmdbClient
from server.db import queries
from server.db.contract import enqueue
from server.db.payloads import FetchMessage, SweepMessage
from server.db.pool import Database
from server.workers.runner import Done, Outcome, Reject

log = logging.getLogger(__name__)

# Starting values (tmdb.md#starting-values and the sweep section).
MAX_PAGES = 500  # what TMDB serves for one query
GUARD_PERCENT = 20  # a run may not remove more than this share of a service's offers
FIRST_YEAR = 1870  # before any film in TMDB
WRITE_CHUNK = 5_000  # offers per statement: seconds, against the 60 s timeout


class SweepIncomplete(Exception):
    """The service's list could not be read to the end. The message is safe to log."""


@dataclass(frozen=True)
class Seen:
    """What one service offers: the TMDB ids per offer kind (our names)."""

    by_kind: dict[str, frozenset[int]]
    year_splits: int  # queries that had to be split by release year


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Id(_Loose):
    id: int


class _Page(_Loose):
    results: list[_Id]
    total_pages: int


def refuses(stale: int, before: int) -> bool:
    """True when removing `stale` of the `before` offers a service had is more than 20%."""
    return stale * 100 > GUARD_PERCENT * before


# --- Reading the lists.


async def collect(tmdb: TmdbClient, country: str, provider_id: int, last_year: int) -> Seen:
    """Every film one service offers in one country, by offer kind. Raises `SweepIncomplete`
    when a list cannot be read to the end, and lets `TmdbRetryLater` and `TmdbError` escape."""
    by_kind: dict[str, frozenset[int]] = {}
    splits = 0
    for tmdb_name, kind in OFFER_KINDS.items():
        query = {
            "watch_region": country,
            "with_watch_providers": provider_id,
            "with_watch_monetization_types": tmdb_name,
            "vote_count.gte": MIN_VOTES,
            "include_adult": False,
            "sort_by": "popularity.desc",
        }
        ids = await _all_pages(tmdb, query)
        if ids is None:
            splits += 1
            ids = set()
            for year in range(FIRST_YEAR, last_year + 1):
                part = await _all_pages(tmdb, {**query, "primary_release_year": year})
                if part is None:
                    raise SweepIncomplete(f"{kind}: {year} alone has over {MAX_PAGES} pages")
                ids |= part
        by_kind[kind] = frozenset(ids)
    return Seen(by_kind, splits)


async def _all_pages(tmdb: TmdbClient, query: dict[str, Any]) -> set[int] | None:
    """Every id of a query, or None when it has more pages than TMDB serves."""
    first = await _page(tmdb, query, 1)
    if first.total_pages > MAX_PAGES:
        return None
    ids = {film.id for film in first.results}
    for number in range(2, first.total_pages + 1):
        ids |= {film.id for film in (await _page(tmdb, query, number)).results}
    return ids


async def _page(tmdb: TmdbClient, query: dict[str, Any], number: int) -> _Page:
    body = await tmdb.get("/discover/movie", {**query, "page": number})
    if isinstance(body, NotFound):
        raise SweepIncomplete(f"page {number} not found")
    try:
        return _Page.model_validate(body)
    except ValidationError:
        raise SweepIncomplete(f"page {number} is not a discover page") from None


# --- The job: one run, one step per service.


async def run_availability_sweep(database: Database) -> Outcome:
    """Open the run and send its steps, all or nothing, so a job that comes back opens no
    second run over a half-sent first."""
    async with database.connection() as conn:
        _, swept = await read_swept_set(conn)
        steps = [
            (country, provider) for country in sorted(swept) for provider in sorted(swept[country])
        ]
        async with conn.transaction():
            cur = await conn.execute(queries.load("open_run"), ("availability_sweep",))
            row = await cur.fetchone()
            assert row is not None
            run_id: int = row[0]
            await conn.execute(
                queries.load("set_run_cursor"), (Jsonb({"steps": len(steps), "done": []}), run_id)
            )
            for country, provider in steps:
                await enqueue(
                    conn,
                    "catalog_refresh",
                    SweepMessage(run_id=run_id, country=country, provider_id=provider),
                )
            if not steps:
                await conn.execute(queries.load("finish_sweep_run"), (run_id,))
    log.info("availability sweep run=%s steps=%s", run_id, len(steps))
    return Done()


# --- One step.


def _step_key(message: SweepMessage) -> str:
    return f"{message.country}:{message.provider_id}"


async def run_sweep(
    database: Database, tmdb: TmdbClient, message: SweepMessage, *, today: date | None = None
) -> Outcome:
    """One service in one country. `Reject` for a run that does not exist; a failing page
    escapes (nothing is written, the message comes back)."""
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("sweep_run"), (message.run_id,))
        run = await cur.fetchone()
        _, swept = await read_swept_set(conn)
    if run is None:
        return Reject(f"no sweep run {message.run_id}")
    started_at: datetime = run[0]
    if message.provider_id not in swept.get(message.country, frozenset()):
        # Curated away since the job sent it: leave its rows alone.
        log.warning(
            "sweep skipped run=%s provider=%s: not swept", message.run_id, message.provider_id
        )
        await _record(database, message, {"sweeps_skipped": 1})
        return Done()

    last_year = (today or datetime.now(UTC).date()).year + 1  # a film dated next year
    try:
        seen = await collect(tmdb, message.country, message.provider_id, last_year)
    except SweepIncomplete as error:
        log.error(
            "sweep incomplete run=%s country=%s provider=%s: %s",
            message.run_id,
            message.country,
            message.provider_id,
            error,
        )
        await _record(database, message, {"sweeps_incomplete": 1}, errors=1)
        return Done()

    counts = await _write(database, message, seen, started_at)
    await _record(database, message, counts.stats, touched=counts.touched)
    return Done()


@dataclass(frozen=True)
class _Written:
    stats: dict[str, int]
    touched: int


async def _write(
    database: Database, message: SweepMessage, seen: Seen, started_at: datetime
) -> _Written:
    country, provider = message.country, message.provider_id
    pairs = [(film, kind) for kind, ids in seen.by_kind.items() for film in sorted(ids)]
    all_ids = sorted({film for film, _ in pairs})
    stats: dict[str, int] = {"services_swept": 1, "rows_seen": len(pairs)}
    if seen.year_splits:
        stats["year_splits"] = seen.year_splits

    async with database.connection() as conn:
        cur = await conn.execute(queries.load("sweep_rows_of_service"), (country, provider))
        row = await cur.fetchone()
        assert row is not None
        before: int = row[0]
        known: set[int] = set()
        for chunk in batches(all_ids, WRITE_CHUNK):
            cur = await conn.execute(queries.load("known_tmdb_ids_among"), (chunk,))
            known |= {r[0] for r in await cur.fetchall()}

    added = 0
    for chunk in batches(pairs, WRITE_CHUNK):
        async with database.connection() as conn:
            cur = await conn.execute(
                queries.load("upsert_seen_availability"),
                {
                    "country": country,
                    "provider_id": provider,
                    "tmdb_ids": [film for film, _ in chunk],
                    "kinds": [kind for _, kind in chunk],
                },
            )
            added += sum(1 for _, inserted in await cur.fetchall() if inserted)
    stats["rows_added"] = added

    # The delete and the tiers of the films it touched commit together, so a step that comes
    # back after a crash cannot find the offers gone and the tiers still wrong.
    tiers_changed = 0
    async with database.connection() as conn, conn.transaction():
        cur = await conn.execute(
            queries.load("stale_availability_count"), (country, provider, started_at)
        )
        row = await cur.fetchone()
        assert row is not None
        stale: int = row[0]
        deleted: set[int] = set()
        deleted_rows = 0
        if refuses(stale, before):
            log.error(
                "sweep guard tripped run=%s country=%s provider=%s refused_rows=%s of=%s",
                message.run_id,
                country,
                provider,
                stale,
                before,
            )
            stats["guard_trips"] = 1
            stats[f"guard_refused_{country}_{provider}"] = stale
        else:
            # Lock the films first, in id order (so two steps cannot deadlock). Two steps that
            # drop the last two offers of one film would otherwise each still see the other's
            # uncommitted row and leave the film at tier 1. After the lock, every later
            # statement sees what the other step committed. A fetch of the film takes the same
            # lock through its upsert and touches no other title, so it cannot deadlock with a
            # step. A bulk update of many titles (the popularity job) could; Postgres then
            # aborts one side and the message is retried.
            cur = await conn.execute(
                queries.load("stale_availability_titles"), (country, provider, started_at)
            )
            await conn.execute(queries.load("lock_titles"), ([r[0] for r in await cur.fetchall()],))
            cur = await conn.execute(
                queries.load("delete_stale_availability"), (country, provider, started_at)
            )
            gone = await cur.fetchall()
            deleted_rows = len(gone)
            deleted = {r[0] for r in gone}
            cur = await conn.execute(queries.load("refresh_tiers"), (sorted(deleted),))
            tiers_changed += cur.rowcount
    stats["rows_deleted"] = deleted_rows

    # Every film seen, not only the new offers: it only writes tiers that are wrong, so it
    # also mends a step that was cut short before this point.
    touched = len(deleted | set(await _title_ids(database, all_ids)))
    for chunk in batches(all_ids, WRITE_CHUNK):
        async with database.connection() as conn:
            cur = await conn.execute(queries.load("refresh_tiers_by_tmdb_id"), (chunk,))
            tiers_changed += cur.rowcount
    stats["tiers_changed"] = tiers_changed

    stats["films_queued"] = await _queue_unknown(
        database, message.run_id, [film for film in all_ids if film not in known]
    )
    return _Written(stats, touched)


async def _title_ids(database: Database, tmdb_ids: Sequence[int]) -> list[int]:
    found: list[int] = []
    for chunk in batches(list(tmdb_ids), WRITE_CHUNK):
        async with database.connection() as conn:
            cur = await conn.execute(queries.load("title_ids_among"), (chunk,))
            found += [r[0] for r in await cur.fetchall()]
    return found


async def _queue_unknown(database: Database, run_id: int, unknown: Sequence[int]) -> int:
    """Queue films the catalog lacks for a full fetch, unless one already waits."""
    if not unknown:
        return 0
    waiting: set[int] = set()
    async with database.connection() as conn:
        for chunk in batches(list(unknown), WRITE_CHUNK):
            cur = await conn.execute(queries.load("pending_fetch_ids"), (chunk,))
            waiting |= {r[0] for r in await cur.fetchall()}
    to_queue = [film for film in unknown if film not in waiting]
    for ids in batches(to_queue, FETCH_BATCH):
        async with database.connection() as conn:
            await enqueue(
                conn, "catalog_refresh", FetchMessage(run_id=run_id, tmdb_ids=ids, reason="sweep")
            )
    return len(to_queue)


async def _record(
    database: Database,
    message: SweepMessage,
    counts: dict[str, int],
    *,
    errors: int = 0,
    touched: int = 0,
) -> None:
    """Add the step to its run once, and end the run when it was the last."""
    async with database.connection() as conn, conn.transaction():
        await conn.execute(
            queries.load("record_sweep_step"),
            {
                "run_id": message.run_id,
                "step": _step_key(message),
                "touched": touched,
                "errors": errors,
                "counts": Jsonb(counts),
            },
        )
        await conn.execute(queries.load("finish_sweep_run"), (message.run_id,))
