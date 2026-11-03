"""The refresh schedule: the changes feed, the weekly and monthly full fetches (M2.11).

The rules: tmdb.md#keeping-it-fresh. Supabase Cron queues a `job` message for each (migration
`catalog_schedule`); these are three of the six jobs.

- `changes_daily`: `/3/movie/changes` since the last changes run that read the feed to the end,
  at most 14 days back (24 hours when there is no earlier run). Only films the catalog holds
  are fetched, as `fetch` messages with reason `changes`. A run that fails before the end of
  the feed has no `changes_days` in its stats, so the next run covers its days again.
- `details_weekly`: sets every `quality_score` from the current C (never stored, decision Q18;
  the same pass as the backfill's), then fetches tier 1 films that TMDB still lists, reason
  `weekly`.
- `details_monthly`: clears the films that TMDB has not returned for 6 months (decision Q22),
  then fetches tier 2 films and inactive ones, reason `monthly`. Together the two lists cover
  every film, which keeps each inside TMDB's 6-month rule.

A fetch of the weekly run counts offers compared with the sweep and offers that disagreed into
the run's stats, after the job has ended. Once the fetches have had time to finish, the next
changes or weekly run records the share that agreed as `agreement_percent` in that run's stats.
Under 98% it is logged as an error; M9.5 turns it into an alert. Nothing switches by itself
(decision Q23).

Fetch messages carry the run's id and are idempotent, and so are the jobs: running one twice
opens a second run and queues the same fetches again.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, ValidationError

from server.catalog.backfill import set_quality_scores
from server.catalog.popularity import batches
from server.catalog.tmdb import NotFound, TmdbClient
from server.db import queries
from server.db.contract import enqueue
from server.db.payloads import FetchMessage, FetchReason
from server.db.pool import Database
from server.workers.runner import Done, Outcome

log = logging.getLogger(__name__)

# Starting values (tmdb.md#starting-values, tmdb.md#keeping-it-fresh).
CHANGES_MAX_DAYS = 14  # what TMDB's changes feed allows in one query
AGREEMENT_FLOOR_PERCENT = 98.0
FETCH_BATCH = 100  # a fetch message holds at most 100 ids
KNOWN_CHUNK = 5_000


class ChangesUnreadable(Exception):
    """A page of the changes feed is not a changes page. The message is safe to log."""


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Change(_Loose):
    id: int


class _ChangesPage(_Loose):
    results: list[_Change]
    total_pages: int


# --- Pure.


def changes_window(last_finished: datetime | None, now: datetime) -> tuple[date, date]:
    """The days to ask the changes feed for: from the last run that finished (at most 14 days
    back) to today. With no earlier run, the last 24 hours. TMDB takes whole days, so the first
    day may be read twice; fetching a film again is harmless."""
    now = now.astimezone(UTC)
    day_ago = now - timedelta(days=1)  # never less than the last 24 hours
    start = day_ago if last_finished is None else min(last_finished, day_ago)
    start = max(start, now - timedelta(days=CHANGES_MAX_DAYS))
    return start.astimezone(UTC).date(), now.date()


def agreement_percent(compared: int, disagreements: int) -> float | None:
    """The share of offers on which the film's own answer and the sweep agreed, in percent with
    two decimals; None when nothing was compared."""
    if compared <= 0:
        return None
    return round(100 * (1 - disagreements / compared), 2)


# --- Runs.


async def _open_run(database: Database, kind: str) -> int:
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("open_run"), (kind,))
        row = await cur.fetchone()
    assert row is not None
    run_id: int = row[0]
    return run_id


async def _finish_run(
    database: Database, run_id: int, stats: dict[str, Any], note: str | None
) -> None:
    """End a run whose fetch messages may already be counting into it: stats are merged."""
    async with database.connection() as conn:
        await conn.execute(
            queries.load("finish_run_keeping_counts"), (note, None, Jsonb(stats), run_id)
        )


async def _fail_run(database: Database, run_id: int, stats: dict[str, Any], note: str) -> None:
    """End a run that failed before it sent any fetch, with an error."""
    async with database.connection() as conn:
        await conn.execute(queries.load("finish_run"), (1, note, Jsonb(stats), run_id))


async def _fan_out(
    database: Database, run_id: int, tmdb_ids: Sequence[int], reason: FetchReason
) -> int:
    """Queue the films as `fetch` messages of at most 100 ids. Returns how many films."""
    for ids in batches(list(tmdb_ids), FETCH_BATCH):
        async with database.connection() as conn:
            await enqueue(
                conn, "catalog_refresh", FetchMessage(run_id=run_id, tmdb_ids=ids, reason=reason)
            )
    return len(tmdb_ids)


async def _ids(database: Database, query: str) -> list[int]:
    async with database.connection() as conn:
        cur = await conn.execute(queries.load(query))
        return [row[0] for row in await cur.fetchall()]


# --- The agreement share.


async def record_agreement(database: Database) -> list[tuple[int, float]]:
    """Record the agreement share of every weekly run whose fetches are over and that has none
    yet. Returns (run id, percent) for each. Safe to run twice: a run is recorded once."""
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("untallied_agreement"))
        runs = await cur.fetchall()
    recorded: list[tuple[int, float]] = []
    for run_id, compared, disagreements in runs:
        percent = agreement_percent(compared, disagreements)
        if percent is None:
            continue
        async with database.connection() as conn:
            await conn.execute(queries.load("record_agreement"), (percent, run_id))
        recorded.append((run_id, percent))
        if percent < AGREEMENT_FLOOR_PERCENT:
            log.error(
                "availability agreement under %s%% run=%s percent=%s compared=%s",
                AGREEMENT_FLOOR_PERCENT,
                run_id,
                percent,
                compared,
            )
    return recorded


# --- changes_daily.


async def run_changes_daily(
    database: Database, tmdb: TmdbClient, *, now: datetime | None = None
) -> Outcome:
    """One run. A page that fails leaves the run finished with an error and no `changes_days`,
    and escapes, so the message comes back and the next run covers the same days."""
    now = now or datetime.now(UTC)
    await record_agreement(database)
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("last_changes_run"))
        row = await cur.fetchone()
    last: datetime | None = row[0] if row else None
    start, end = changes_window(last, now)
    run_id = await _open_run(database, "changes_daily")
    stats: dict[str, Any] = {}
    try:
        seen = await _read_changes(tmdb, start, end)
        stats["changes_seen"] = len(seen)
        in_catalog = await _in_catalog(database, sorted(seen))
        stats["films_queued"] = await _fan_out(database, run_id, in_catalog, "changes")
        stats["changes_days"] = (end - start).days
    except ChangesUnreadable as error:
        log.error("changes run=%s unreadable: %s", run_id, error)
        await _fail_run(database, run_id, stats, f"unreadable: {error}")
        return Done()  # tomorrow's run covers the same days again
    except Exception as error:
        log.exception("changes run interrupted run=%s", run_id)
        await _fail_run(database, run_id, stats, f"{type(error).__name__}, will be retried")
        raise
    await _finish_run(database, run_id, stats, note=f"{start.isoformat()} to {end.isoformat()}")
    log.info(
        "changes run=%s days=%s queued=%s", run_id, stats["changes_days"], stats["films_queued"]
    )
    return Done()


async def _read_changes(tmdb: TmdbClient, start: date, end: date) -> set[int]:
    seen: set[int] = set()
    params: dict[str, Any] = {"start_date": start.isoformat(), "end_date": end.isoformat()}
    page, total = 1, 1
    while page <= total:
        body = await tmdb.get("/movie/changes", {**params, "page": page})
        if isinstance(body, NotFound):
            raise ChangesUnreadable(f"page {page} not found")
        try:
            parsed = _ChangesPage.model_validate(body)
        except ValidationError:
            raise ChangesUnreadable(f"page {page} is not a changes page") from None
        seen |= {change.id for change in parsed.results}
        total = parsed.total_pages
        page += 1
    return seen


async def _in_catalog(database: Database, tmdb_ids: list[int]) -> list[int]:
    """The ids the catalog holds, active or not (a film that came back is fetched too)."""
    found: set[int] = set()
    for chunk in batches(tmdb_ids, KNOWN_CHUNK):
        async with database.connection() as conn:
            cur = await conn.execute(queries.load("known_tmdb_ids_among"), (chunk,))
            found |= {row[0] for row in await cur.fetchall()}
    return sorted(found)


# --- details_weekly and details_monthly.


async def run_details_weekly(database: Database) -> Outcome:
    """Scores first, so every film follows the current C even before its fetch; then the fetches
    (which score each film from the same C). The run is finished once the messages are sent."""
    await record_agreement(database)
    run_id = await _open_run(database, "details_weekly")
    stats: dict[str, Any] = {}
    average, scored = await set_quality_scores(database)
    stats["scores_set"] = scored
    if average is not None:
        stats["quality_c"] = round(average, 4)
    stats["films_queued"] = await _fan_out(
        database, run_id, await _ids(database, "tier1_tmdb_ids"), "weekly"
    )
    await _finish_run(database, run_id, stats, None)
    log.info("details weekly run=%s queued=%s scored=%s", run_id, stats["films_queued"], scored)
    return Done()


async def run_details_monthly(database: Database) -> Outcome:
    """Clears first: a film cleared this month is a bare row, and the fetch that follows asks
    TMDB for it once more, so one that came back is restored."""
    run_id = await _open_run(database, "details_monthly")
    stats: dict[str, Any] = {}
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("clear_missing_titles"))
        stats["films_cleared"] = cur.rowcount
    stats["films_queued"] = await _fan_out(
        database, run_id, await _ids(database, "monthly_tmdb_ids"), "monthly"
    )
    await _finish_run(database, run_id, stats, None)
    log.info(
        "details monthly run=%s queued=%s cleared=%s",
        run_id,
        stats["films_queued"],
        stats["films_cleared"],
    )
    return Done()
