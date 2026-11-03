"""The first full load, inline (`server backfill`, tmdb.md#the-first-full-load).

The same worker code, run once from a laptop or CI:

1. Reference data (`run_reference_weekly`). If it fails the backfill stops: nothing else is
   opened.
2. Candidates: the top films of the export file (60,000, or `--limit N`).
3. Fetch every candidate not stored yet, 100 at a time, through the same `run_fetch` the
   queue uses, at the TMDB client's 20 requests a second. The floor judges each one.
4. A SQL pass sets C and every `quality_score`. C is computed once, after every film is in,
   and never stored (decision Q18).
5. Placeholders (M2.8): every film with a poster and no placeholder gets one, so a run that
   was interrupted or had failed downloads is mended by running `backfill` again.

It can resume. The run's `ingest_runs.cursor` holds `export_day` (the file the candidates came
from, so the order cannot change under it) and `position` (how many candidates are done). An
interrupted run stays open; the next `backfill` finds it and carries on from `position`.

`--limit` caps the candidates and doubles as the local catalog seeder (decision Q20): a
database that holds the synthetic seed works, because the seed's genre slugs are prefixed
`seed_` and cannot collide with TMDB's.
"""

import logging
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from psycopg.types.json import Jsonb

from server.catalog.curation import Curation, load_curation
from server.catalog.fetch import CONCURRENCY, PHASES, QUALITY_M, run_fetch
from server.catalog.placeholders import Posters, fill_missing_placeholders
from server.catalog.popularity import (
    FETCH_BATCH,
    TOP_CANDIDATES,
    ExportLoader,
    ExportSource,
    batches,
    known_title_ids,
)
from server.catalog.reference import run_reference_weekly
from server.catalog.tmdb import TmdbClient
from server.config import Process, Settings
from server.db import queries
from server.db.payloads import FetchMessage
from server.db.pool import Database

log = logging.getLogger(__name__)

# Titles per statement of the quality pass: a few seconds each, far under the 60 s timeout.
QUALITY_CHUNK = 5_000


# Films side by side, each holding a connection only for its write, plus one for the run's own
# bookkeeping. Backfill is its own process with no reader connection, so this is the whole pool.
BACKFILL_POOL_SIZE = CONCURRENCY + 1

# What counts as a film dealt with, for the films-a-second figure.
_FILM_COUNTS = ("films_written", "films_not_found", "films_below_floor", "films_failed")
_PHASE_NAMES = {
    "ms_tmdb": "tmdb",
    "ms_poster": "poster",
    "ms_pool_wait": "waiting for a connection",
    "ms_read": "reads",
    "ms_write": "write",
}


class BackfillFailed(Exception):
    """The backfill cannot go on until someone looks. The message is safe to print."""


@dataclass(frozen=True)
class BackfillResult:
    run_id: int
    candidates: int
    resumed: bool
    average: float | None  # C, when there was one
    quality_scores: int
    films: int = 0  # dealt with by this process (a resumed run counts only its own part)
    fetch_seconds: float = 0.0  # wall time of the fetching
    phase_ms: dict[str, int] = field(default_factory=dict)  # PHASES, summed over the films


def summary_line(result: BackfillResult) -> str:
    """One line for the person who ran it: the pace, and each phase's share of the time spent.
    Totals only, nothing about any film."""
    pace = result.films / result.fetch_seconds if result.fetch_seconds > 0 else 0.0
    line = (
        f"server backfill: {result.films} films in {result.fetch_seconds:.0f} s, "
        f"{pace:.1f} films a second."
    )
    spent = sum(result.phase_ms.values())
    if spent > 0:
        shares = ", ".join(
            f"{_PHASE_NAMES[phase]} {100 * result.phase_ms.get(phase, 0) / spent:.0f}%"
            for phase in PHASES
        )
        line += f" Time per film: {shares}."
    return line


async def run_backfill(
    database: Database,
    tmdb: TmdbClient,
    curation: Curation,
    source: ExportLoader,
    *,
    limit: int | None = None,
    chunk_size: int = FETCH_BATCH,
    quality_chunk: int = QUALITY_CHUNK,
    posters: Posters | None = None,
) -> BackfillResult:
    """Raises `BackfillFailed` when the reference step or the export file fails, and lets a
    TMDB or database failure escape: the run stays open and the next call resumes it."""
    await _reference(database, tmdb, curation)
    top_n = TOP_CANDIDATES if limit is None else min(limit, TOP_CANDIDATES)
    run_id, cursor, resumed = await _open(database)

    day = date.fromisoformat(cursor["export_day"]) if "export_day" in cursor else None
    try:
        export = await source.load(top_n, frozenset(), day)
    except Exception as error:
        raise BackfillFailed(f"the export file is unavailable: {error}") from error
    if not resumed or day is None:
        cursor = {"export_day": export.day.isoformat(), "position": 0}
        await _set_cursor(database, run_id, cursor)
    candidates = export.top[:top_n]
    position: int = cursor["position"]
    log.info(
        "backfill run=%s candidates=%s position=%s resumed=%s",
        run_id,
        len(candidates),
        position,
        resumed,
    )

    known = await known_title_ids(database)
    before = tmdb.stats
    totals: Counter[str] = Counter()
    fetch_started = time.perf_counter()
    for start in range(position, len(candidates), chunk_size):
        chunk = candidates[start : start + chunk_size]
        to_fetch = [tmdb_id for tmdb_id in chunk if tmdb_id not in known]
        for ids in batches(to_fetch, FETCH_BATCH):
            await run_fetch(
                database,
                tmdb,
                FetchMessage(run_id=run_id, tmdb_ids=ids, reason="candidate"),
                posters,
                totals,
            )
        cursor = {**cursor, "position": start + len(chunk)}
        await _set_cursor(database, run_id, cursor)
        log.info("backfill run=%s position=%s of %s", run_id, cursor["position"], len(candidates))

    fetch_seconds = time.perf_counter() - fetch_started
    films = sum(totals[key] for key in _FILM_COUNTS)
    phase_ms = {phase: totals[phase] for phase in PHASES}
    average, scored = await set_quality_scores(database, quality_chunk)
    after = tmdb.stats
    stats = {key: after[key] - before[key] for key in after} | {
        "quality_scores_set": scored,
        "fetch_wall_ms": round(
            fetch_seconds * 1000
        ),  # this process only; ms_* add up across resumes
    }
    if posters is not None:
        filled = await fill_missing_placeholders(database, posters)
        stats |= {"placeholders_filled": filled.set, "placeholder_errors": filled.errors}
    note = f"export of {cursor['export_day']}, {len(candidates)} candidates"
    async with database.connection() as conn:
        await conn.execute(
            queries.load("finish_run_keeping_counts"), (note, Jsonb(cursor), Jsonb(stats), run_id)
        )
    return BackfillResult(
        run_id, len(candidates), resumed, average, scored, films, fetch_seconds, phase_ms
    )


async def set_quality_scores(
    database: Database, chunk: int = QUALITY_CHUNK
) -> tuple[float | None, int]:
    """C (the average vote of active, non-adult films with 30 votes or more), then every title's
    `quality_score` from it, `chunk` ids at a time. Returns (C, titles scored); with no C yet
    the scores stay as they are."""
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("catalog_average"), ([],))
        row = await cur.fetchone()
        average = row[0] if row else None
        if average is None:
            return None, 0
        cur = await conn.execute(queries.load("title_id_bounds"))
        bounds = await cur.fetchone()
    assert bounds is not None
    low, high = bounds
    scored = 0
    for start in range(low, high + 1, chunk):
        async with database.connection() as conn:
            cur = await conn.execute(
                queries.load("set_quality_scores"),
                {"m": QUALITY_M, "c": average, "lo": start, "hi": start + chunk},
            )
            scored += cur.rowcount
    return average, scored


async def backfill_from_settings(settings: Settings, limit: int | None) -> BackfillResult:
    """What the `server backfill` command runs: its own connections and TMDB client."""
    if settings.tmdb_token is None:
        raise BackfillFailed("TMDB_READ_TOKEN is not set")
    database = await Database.open(
        settings.database_url_for(Process.PIPELINE), pool_size=BACKFILL_POOL_SIZE
    )
    tmdb = TmdbClient(settings.tmdb_token.get_secret_value())
    posters = Posters()
    try:
        return await run_backfill(
            database, tmdb, load_curation(), ExportSource(), limit=limit, posters=posters
        )
    finally:
        await posters.aclose()
        await tmdb.aclose()
        await database.close()


async def _reference(database: Database, tmdb: TmdbClient, curation: Curation) -> None:
    await run_reference_weekly(database, tmdb, curation)
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("latest_reference_run"))
        row = await cur.fetchone()
    if row is None or row[0]:
        raise BackfillFailed(f"the reference step failed ({row[1] if row else 'no run'})")


async def _open(database: Database) -> tuple[int, dict[str, Any], bool]:
    """The run to resume, or a new one. Returns (run id, cursor, resumed)."""
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("unfinished_backfill_run"))
        found = await cur.fetchone()
        if found is not None and found[1] and "position" in found[1]:
            return found[0], found[1], True
        if found is not None:
            return found[0], {}, False
        cur = await conn.execute(queries.load("open_run"), ("backfill",))
        row = await cur.fetchone()
    assert row is not None
    return row[0], {}, False


async def _set_cursor(database: Database, run_id: int, cursor: dict[str, Any]) -> None:
    async with database.connection() as conn:
        await conn.execute(queries.load("set_run_cursor"), (Jsonb(cursor), run_id))
