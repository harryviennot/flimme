"""Shared test helpers: a fake clock, and a transport that only knows recorded requests."""

import asyncio
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_json(relative: str) -> dict[str, Any]:
    return json.loads((FIXTURES / relative).read_text(encoding="utf-8"))


class FakeTime:
    """A clock that only moves when something sleeps."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now = max(self.now, self.now + seconds)
        await asyncio.sleep(0)


Reply = httpx.Response | Exception


class FixtureTransport(httpx.AsyncBaseTransport):
    """Answers from a script per path. A request with no script fails the test (no network).

    `script` maps a path to the replies to give, in order; an exception in the list is raised
    (for example `httpx.ReadTimeout`). The last reply repeats.
    """

    def __init__(
        self,
        script: dict[str, list[Reply]],
        *,
        clock: Callable[[], float] = lambda: 0.0,
        hold: int = 0,
    ) -> None:
        self._script = {path: list(replies) for path, replies in script.items()}
        self._clock = clock
        self._hold = hold
        self.starts: list[float] = []
        self.requests: list[httpx.Request] = []
        self.in_flight = 0
        self.max_in_flight = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/3")
        replies = self._script.get(path)
        if not replies:
            raise AssertionError(f"unrecorded request: {path}")
        self.requests.append(request)
        self.starts.append(self._clock())
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        try:
            for _ in range(self._hold):
                await asyncio.sleep(0)
            reply = replies.pop(0) if len(replies) > 1 else replies[0]
        finally:
            self.in_flight -= 1
        if isinstance(reply, Exception):
            raise reply
        return reply


def json_reply(
    fixture: str, status: int = 200, headers: dict[str, str] | None = None
) -> httpx.Response:
    return httpx.Response(status, json=fixture_json(fixture), headers=headers)


@pytest.fixture
def fake_time() -> FakeTime:
    return FakeTime()


@pytest.fixture
def reply() -> Callable[..., httpx.Response]:
    """`reply("tmdb/movie_60000001.json", 503, {"Retry-After": "3"})`."""
    return json_reply


@pytest.fixture
def transport_class() -> type[FixtureTransport]:
    return FixtureTransport


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    # anyio's pytest plugin (already installed with FastAPI) runs the async tests on asyncio.
    return "asyncio"
