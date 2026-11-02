"""The one TMDB client: polite, patient, and honest about failures.

One instance per process, shared by every handler, so its limiter is the only one
(tmdb.md#failures-and-retries). It never logs the token, the query or a response body.

- 20 request starts per second and 8 in flight. After a 429 the rate is halved for 5 minutes.
- 429: wait `Retry-After` if sent, else 1 second doubling up to 60.
- 5xx, a timeout (10 seconds) or a dropped connection: 3 retries with backoff, then
  `TmdbRetryLater`, so the caller leaves the queue message to come back.
- 404: `NotFound`, never retried. The caller deactivates the film.
"""

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.themoviedb.org/3"

# Starting values (tmdb.md#starting-values). Code constants, not settings.
REQUESTS_PER_SECOND = 20
MAX_IN_FLIGHT = 8
TIMEOUT_SECONDS = 10.0
SERVER_ERROR_RETRIES = 3
BACKOFF_START_SECONDS = 1.0
RATE_LIMIT_WAIT_START_SECONDS = 1.0
RATE_LIMIT_WAIT_CAP_SECONDS = 60.0
REDUCED_RATE_SECONDS = 300.0
# Not in the doc: how many 429s in a row one call waits out before giving up.
MAX_RATE_LIMIT_WAITS = 10

type Params = Mapping[str, str | int | float | bool]


@dataclass(frozen=True)
class NotFound:
    """TMDB answered 404."""


class TmdbRetryLater(Exception):
    """TMDB is failing or limiting us; the caller leaves the message to come back."""


class TmdbError(Exception):
    """TMDB refused the request for a reason retrying won't fix (a 401, a 400)."""


class _Limiter:
    """At most `rate` starts in any sliding second; the rate halves after a 429."""

    def __init__(
        self,
        rate: int,
        clock: Callable[[], float],
        sleep: Callable[[float], Awaitable[None]],
    ) -> None:
        self._rate = rate
        self._clock = clock
        self._sleep = sleep
        self._starts: deque[float] = deque()
        self._lock = asyncio.Lock()
        self._reduced_until = float("-inf")

    def halve(self) -> None:
        self._reduced_until = self._clock() + REDUCED_RATE_SECONDS

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = self._clock()
                limit = max(1, self._rate // 2) if now < self._reduced_until else self._rate
                while self._starts and self._starts[0] <= now - 1.0:
                    self._starts.popleft()
                if len(self._starts) < limit:
                    self._starts.append(now)
                    return
                # Wait until the oldest start in the window falls out of it.
                await self._sleep(self._starts[0] + 1.0 - now)


class TmdbClient:
    def __init__(
        self,
        token: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=httpx.Timeout(TIMEOUT_SECONDS),
            transport=transport,
        )
        self._sleep = sleep
        self._limiter = _Limiter(REQUESTS_PER_SECOND, clock, sleep)
        self._in_flight = asyncio.Semaphore(MAX_IN_FLIGHT)
        self.requests = 0
        self.rate_limited = 0

    @property
    def stats(self) -> dict[str, int]:
        """What `ingest_runs.stats` records about this client."""
        return {"requests": self.requests, "rate_limited": self.rate_limited}

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, path: str, params: Params | None = None) -> dict[str, Any] | NotFound:
        body = await self._get_json(path, params)
        if isinstance(body, NotFound):
            return body
        if not isinstance(body, dict):
            raise TmdbError(f"unexpected body for {path}")
        return body

    async def get_list(self, path: str, params: Params | None = None) -> list[Any] | NotFound:
        """For the few endpoints that answer with a JSON array (`/configuration/countries`)."""
        body = await self._get_json(path, params)
        if isinstance(body, NotFound):
            return body
        if not isinstance(body, list):
            raise TmdbError(f"unexpected body for {path}")
        return body

    async def _get_json(self, path: str, params: Params | None) -> Any | NotFound:
        server_failures = 0
        rate_limits = 0
        while True:
            status, response = await self._send_once(path, params)
            if status == 200 and response is not None:
                try:
                    body = response.json()
                except ValueError:
                    raise TmdbError(f"unreadable body for {path}") from None
                return body
            if status == 404:
                return NotFound()
            if status == 429:
                self.rate_limited += 1
                self._limiter.halve()
                if rate_limits >= MAX_RATE_LIMIT_WAITS:
                    logger.warning("tmdb gave up path=%s status=429", path)
                    raise TmdbRetryLater(path)
                wait = _retry_after(response) or min(
                    RATE_LIMIT_WAIT_START_SECONDS * 2**rate_limits, RATE_LIMIT_WAIT_CAP_SECONDS
                )
                rate_limits += 1
                logger.info("tmdb rate limited path=%s status=429 wait=%s", path, wait)
                await self._sleep(wait)
                continue
            if status == 0 or status >= 500:
                if server_failures >= SERVER_ERROR_RETRIES:
                    logger.warning("tmdb gave up path=%s status=%s", path, status)
                    raise TmdbRetryLater(path)
                wait = BACKOFF_START_SECONDS * 2**server_failures
                server_failures += 1
                logger.info("tmdb retry path=%s status=%s wait=%s", path, status, wait)
                await self._sleep(wait)
                continue
            logger.warning("tmdb refused path=%s status=%s", path, status)
            raise TmdbError(f"{path} answered {status}")

    async def _send_once(
        self, path: str, params: Params | None
    ) -> tuple[int, httpx.Response | None]:
        """One request. Status 0 stands for a timeout or a dropped connection."""
        async with self._in_flight:
            await self._limiter.acquire()
            self.requests += 1
            try:
                response = await self._http.get(path, params=params)
            except httpx.TransportError as error:
                # The class name only: messages can hold the URL.
                logger.info("tmdb transport error path=%s kind=%s", path, type(error).__name__)
                return 0, None
            return response.status_code, response


def _retry_after(response: httpx.Response | None) -> float | None:
    if response is None:
        return None
    try:
        seconds = float(response.headers["Retry-After"])
    except (KeyError, ValueError):
        return None
    if seconds <= 0:
        return None
    return min(seconds, RATE_LIMIT_WAIT_CAP_SECONDS)
