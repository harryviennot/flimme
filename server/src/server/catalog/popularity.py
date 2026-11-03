"""Which films are candidates, and the daily popularity job.

The rules: tmdb.md#which-films-are-in-the-catalog.

TMDB publishes a file of every valid movie id with its popularity every day, ready by 08:00 UTC
and kept for 3 months: `files.tmdb.org/p/exports/movie_ids_MM_DD_YYYY.json.gz`, one JSON object
per line. It is public and needs no key. The top 60,000 by popularity, leaving out adult and
video entries, are candidates.

Load, compute, write. `read_export` is the pure middle: lines in, the top ids and the popularity
of the films we hold out. `ExportSource` downloads the file to a temporary one and reads it
without holding it in memory. `run_popularity_daily` then:

1. updates `titles.popularity` across the catalog, in chunks that fit the 60 s timeout,
2. queues the top ids that are not in `titles` yet and do not already wait in the queue as
   `fetch` messages (reason `candidate`), at most 100 to a message, all on one connection.

The floor judges them when they are fetched (fetch.py): a candidate under it is not stored, so
the few that fail are queued again each day (decision Q19, measured in M2.13). Running the job
twice is safe: fetches are upserts and an unchanged popularity is not written again.
"""

import asyncio
import gzip
import heapq
import json
import logging
import os
import tempfile
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

import httpx
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from server.db import queries
from server.db.contract import enqueue_many
from server.db.payloads import FetchMessage
from server.db.pool import Database
from server.workers.runner import Done, Outcome

log = logging.getLogger(__name__)

# Starting values (tmdb.md#starting-values).
TOP_CANDIDATES = 60_000
EXPORT_HOST = "https://files.tmdb.org"
EXPORT_READY_HOUR_UTC = 8
# Today's file, then yesterday's and the day before: a late file is not a failed job.
EXPORT_DAYS_TRIED = 3
DOWNLOAD_TIMEOUT_S = 120.0
FETCH_BATCH = 100  # a fetch message holds at most 100 ids
UPDATE_CHUNK = 5_000
QUEUED_CHUNK = 5_000  # ids per look at the queue
ENQUEUE_PIPELINE = 50  # messages per round trip


class ExportUnavailable(Exception):
    """No export file for any day tried. Tomorrow's run will find one."""


@dataclass(frozen=True)
class Export:
    day: date
    top: list[int]  # tmdb ids, most popular first, no adult and no video entries
    popularity: dict[int, float]  # for the ids asked for, whether or not they made the top


class ExportLoader(Protocol):
    async def load(self, top_n: int, wanted: frozenset[int], day: date | None = None) -> Export: ...


def batches[T](items: Sequence[T], size: int) -> Iterator[list[T]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


def latest_ready_day(now: datetime) -> date:
    """The newest file that is certainly there: today's from 08:00 UTC, else yesterday's."""
    now = now.astimezone(UTC)
    return now.date() if now.hour >= EXPORT_READY_HOUR_UTC else now.date() - timedelta(days=1)


def export_path(day: date) -> str:
    return f"/p/exports/movie_ids_{day:%m_%d_%Y}.json.gz"


def read_export(
    lines: Iterable[bytes | str], top_n: int, wanted: frozenset[int]
) -> tuple[list[int], dict[int, float]]:
    """The `top_n` most popular ids (adult and video entries left out; ties go to the lower
    id) and the popularity of every wanted id. A line that is not an entry is skipped."""
    heap: list[tuple[float, int]] = []  # smallest first: (popularity, -id)
    popularity: dict[int, float] = {}
    for line in lines:
        entry = _entry(line)
        if entry is None:
            continue
        tmdb_id, value, adult, video = entry
        if tmdb_id in wanted:
            popularity[tmdb_id] = value
        if adult or video or top_n <= 0:
            continue
        item = (value, -tmdb_id)
        if len(heap) < top_n:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)
    ranked = sorted(heap, reverse=True)
    return [-negative_id for _, negative_id in ranked], popularity


def _entry(line: bytes | str) -> tuple[int, float, bool, bool] | None:
    try:
        data: Any = json.loads(line)
        tmdb_id, value = data["id"], data.get("popularity", 0.0)
    except (ValueError, KeyError, TypeError, AttributeError):
        return None
    if not isinstance(tmdb_id, int) or isinstance(tmdb_id, bool):
        return None
    if not isinstance(value, int | float):
        return None
    return tmdb_id, float(value), bool(data.get("adult")), bool(data.get("video"))


def _read_file(
    path: Path, top_n: int, wanted: frozenset[int]
) -> tuple[list[int], dict[int, float]]:
    with gzip.open(path, "rb") as handle:
        return read_export(handle, top_n, wanted)


class ExportSource:
    """Downloads the export file. `transport` and `clock` are for tests: nothing else reaches
    the network in them."""

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._transport = transport
        self._clock = clock

    async def load(self, top_n: int, wanted: frozenset[int], day: date | None = None) -> Export:
        """The file of `day`, or the newest of the last few days when none is named."""
        if day is None:
            newest = latest_ready_day(self._clock())
            days = [newest - timedelta(days=back) for back in range(EXPORT_DAYS_TRIED)]
        else:
            days = [day]
        async with httpx.AsyncClient(
            base_url=EXPORT_HOST,
            transport=self._transport,
            timeout=httpx.Timeout(DOWNLOAD_TIMEOUT_S),
            follow_redirects=True,
        ) as client:
            for candidate in days:
                path = await self._download(client, candidate)
                if path is None:
                    continue
                try:
                    top, popularity = await asyncio.to_thread(_read_file, path, top_n, wanted)
                finally:
                    path.unlink(missing_ok=True)
                return Export(candidate, top, popularity)
        raise ExportUnavailable(f"no export file for {days[-1]} to {days[0]}")

    @staticmethod
    async def _download(client: httpx.AsyncClient, day: date) -> Path | None:
        """The file in a temporary place, or None when TMDB has no file for that day."""
        async with client.stream("GET", export_path(day)) as response:
            if response.status_code == 404:
                return None
            response.raise_for_status()
            handle, name = tempfile.mkstemp(prefix="tmdb-export-", suffix=".json.gz")
            path = Path(name)
            try:
                with os.fdopen(handle, "wb") as out:
                    async for chunk in response.aiter_bytes():
                        out.write(chunk)
            except BaseException:
                path.unlink(missing_ok=True)
                raise
            return path


async def known_title_ids(database: Database) -> frozenset[int]:
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("known_title_ids"))
        return frozenset(row[0] for row in await cur.fetchall())


async def update_popularity(database: Database, popularity: dict[int, float]) -> int:
    """Returns how many films changed. One chunk at a time, so each statement fits the 60 s
    timeout."""
    changed = 0
    ids = sorted(popularity)
    for chunk in batches(ids, UPDATE_CHUNK):
        async with database.connection() as conn:
            cur = await conn.execute(
                queries.load("update_popularity"), (chunk, [popularity[i] for i in chunk])
            )
            changed += cur.rowcount
    return changed


async def run_popularity_daily(
    database: Database, source: ExportLoader, *, top_n: int = TOP_CANDIDATES
) -> Outcome:
    """One run. Always leaves its `ingest_runs` row finished. A missing file is an error in the
    row and `Done` (tomorrow's run is the retry); any other failure escapes, so the message
    comes back."""
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("open_run"), ("popularity_daily",))
        row = await cur.fetchone()
    assert row is not None
    run_id: int = row[0]
    stats: dict[str, int] = {}
    errors = 0
    note: str | None = None
    failure: Exception | None = None
    try:
        note = await _popularity(database, source, run_id, top_n, stats)
    except ExportUnavailable as error:
        errors, note = 1, f"export unavailable: {error}"
        log.error("popularity run failed run=%s reason=%s", run_id, note)
    except Exception as error:
        errors, note, failure = 1, f"{type(error).__name__}, will be retried", error
        log.exception("popularity run interrupted run=%s", run_id)
    async with database.connection() as conn:
        await conn.execute(queries.load("finish_run"), (errors, note, Jsonb(stats), run_id))
    if failure is not None:
        raise failure
    log.info("popularity run done run=%s errors=%s", run_id, errors)
    return Done()


async def _already_queued(conn: AsyncConnection, tmdb_ids: Sequence[int]) -> set[int]:
    """Candidates that already wait in a `fetch` message, so a retry does not queue them twice."""
    waiting: set[int] = set()
    for chunk in batches(tmdb_ids, QUEUED_CHUNK):
        cur = await conn.execute(queries.load("pending_fetch_ids"), (chunk,))
        waiting |= {row[0] for row in await cur.fetchall()}
    return waiting


async def _popularity(
    database: Database, source: ExportLoader, run_id: int, top_n: int, stats: dict[str, int]
) -> str:
    known = await known_title_ids(database)
    export = await source.load(top_n, known)
    stats["popularity_updated"] = await update_popularity(database, export.popularity)
    new = [tmdb_id for tmdb_id in export.top if tmdb_id not in known]
    # One connection for the whole fan-out. A checkout per message waited behind the fetch
    # handlers it had just fed and took over 30 minutes on an empty catalog (3 Nov).
    async with database.connection() as conn:
        waiting = await _already_queued(conn, new)
        new = [tmdb_id for tmdb_id in new if tmdb_id not in waiting]
        messages = [
            FetchMessage(run_id=run_id, tmdb_ids=ids, reason="candidate")
            for ids in batches(new, FETCH_BATCH)
        ]
        for group in batches(messages, ENQUEUE_PIPELINE):
            await enqueue_many(conn, "catalog_refresh", group)
    stats["candidates_queued"] = len(new)
    return f"export of {export.day.isoformat()}"
