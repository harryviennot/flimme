"""Poster placeholders (tmdb.md#images, M2.8): a thumbhash of the w92 poster, made at ingest.

`thumbhash` is the pure part: image bytes in, a base64 string out. `Posters` downloads the
w92 poster (never `original`) and hashes it; it returns `None` when anything goes wrong, so a
failed download leaves the old value and the caller counts an error. The fetch hook computes a
placeholder only when `poster_path` changed; `fill_missing_placeholders` is the one-off pass for
films that have a poster and no placeholder (`server backfill` runs it as its last step).

Logs carry TMDB ids only, never paths.
"""

import asyncio
import io
import logging
from collections import Counter
from dataclasses import dataclass

import httpx
from PIL import Image, UnidentifiedImageError

from server.catalog.thumbhash import image_to_thumbhash
from server.db import queries
from server.db.pool import Database

log = logging.getLogger(__name__)

IMAGE_BASE = "https://image.tmdb.org/t/p/w92"
TIMEOUT_SECONDS = 10.0
CONCURRENCY = 8
PASS_CHUNK = 500


def thumbhash(image_bytes: bytes) -> str:
    """The thumbhash of an image, base64. Raises `ValueError` when the bytes are no image."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.load()
            return image_to_thumbhash(image)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("not an image") from error


class Posters:
    """Downloads w92 posters and hashes them. One per process; `transport` is for tests."""

    def __init__(self, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        # No base_url: its path would swallow the leading slash of a poster path.
        self._http = httpx.AsyncClient(timeout=TIMEOUT_SECONDS, transport=transport)

    async def placeholder(self, poster_path: str) -> str | None:
        """The placeholder for a poster path (`/abc.jpg`), or None when it could not be made."""
        try:
            response = await self._http.get(f"{IMAGE_BASE}{poster_path}")
            response.raise_for_status()
            # Decoding is CPU work: keep it off the event loop.
            return await asyncio.to_thread(thumbhash, response.content)
        except Exception:  # noqa: BLE001  (a poster we cannot read is an error count, nothing more)
            return None

    async def aclose(self) -> None:
        await self._http.aclose()


@dataclass(frozen=True)
class PlaceholderPass:
    set: int
    errors: int


async def fill_missing_placeholders(
    database: Database, posters: Posters, chunk: int = PASS_CHUNK
) -> PlaceholderPass:
    """Gives a placeholder to every film that has a poster and none. A poster that fails is
    counted and skipped; the next run tries it again."""
    counts: Counter[str] = Counter()
    gate = asyncio.Semaphore(CONCURRENCY)
    last_id = 0

    async def one(title_id: int, tmdb_id: int, path: str) -> None:
        async with gate:
            placeholder = await posters.placeholder(path)
        if placeholder is None:
            log.warning("placeholder failed tmdb_id=%s", tmdb_id)
            counts["errors"] += 1
            return
        async with database.connection() as conn:
            cur = await conn.execute(
                queries.load("set_poster_placeholder_by_id"), (placeholder, title_id, path)
            )
        counts["set"] += cur.rowcount

    while True:
        async with database.connection() as conn:
            cur = await conn.execute(queries.load("titles_missing_placeholder"), (last_id, chunk))
            batch = await cur.fetchall()
        if not batch:
            break
        async with asyncio.TaskGroup() as group:
            for title_id, tmdb_id, path in batch:
                group.create_task(one(title_id, tmdb_id, path))
        last_id = batch[-1][0]
    return PlaceholderPass(counts["set"], counts["errors"])
