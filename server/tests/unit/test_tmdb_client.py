"""The TMDB client against scripted, synthetic responses (no network, a fake clock)."""

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

import httpx
import pytest

from server.catalog.tmdb import NotFound, TmdbClient, TmdbError, TmdbRetryLater

TOKEN = "token-that-must-not-leak"
MOVIE = "/movie/60000001"


def run[T](coro: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coro)


def make(transport_class, fake_time, script, hold=0):
    transport = transport_class(script, clock=fake_time.clock, hold=hold)
    client = TmdbClient(TOKEN, transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)
    return client, transport


def max_starts_in_a_second(starts: list[float]) -> int:
    return max(sum(1 for other in starts if t <= other < t + 1.0) for t in starts)


def test_success_returns_the_json_with_the_token_as_a_bearer(transport_class, fake_time, reply):
    client, transport = make(
        transport_class, fake_time, {MOVIE: [reply("tmdb/movie_60000001.json")]}
    )

    async def go():
        return await client.get("/movie/60000001", {"language": "fr-FR"})

    body = run(go())
    assert isinstance(body, dict) and body["id"] == 60000001
    request = transport.requests[0]
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert request.url.params["language"] == "fr-FR"
    assert client.stats == {"requests": 1, "rate_limited": 0}


def test_never_more_than_20_starts_a_second_and_8_in_flight(transport_class, fake_time, reply):
    client, transport = make(
        transport_class, fake_time, {MOVIE: [reply("tmdb/movie_60000001.json")]}, hold=3
    )

    async def go():
        return await asyncio.gather(*(client.get(MOVIE) for _ in range(60)))

    results = run(go())
    assert len(results) == 60
    assert max_starts_in_a_second(transport.starts) <= 20
    assert transport.max_in_flight <= 8
    assert transport.max_in_flight > 1  # the test really ran requests together
    assert fake_time.now > 1000.0  # the limiter made the burst wait


def test_429_with_retry_after_waits_that_long(transport_class, fake_time, reply):
    client, _ = make(
        transport_class,
        fake_time,
        {
            MOVIE: [
                reply("tmdb/rate_limited.json", 429, {"Retry-After": "3"}),
                reply("tmdb/movie_60000001.json"),
            ]
        },
    )
    assert isinstance(run(client.get(MOVIE)), dict)
    assert fake_time.sleeps == [3.0]
    assert client.stats == {"requests": 2, "rate_limited": 1}


def test_429_without_retry_after_doubles_up_to_60(transport_class, fake_time, reply):
    limited = reply("tmdb/rate_limited.json", 429)
    client, _ = make(
        transport_class,
        fake_time,
        {MOVIE: [limited] * 7 + [reply("tmdb/movie_60000001.json")]},
    )
    assert isinstance(run(client.get(MOVIE)), dict)
    assert fake_time.sleeps == [1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 60.0]
    assert client.stats["rate_limited"] == 7


def test_429_halves_the_rate_for_5_minutes_then_restores_it(transport_class, fake_time, reply):
    client, transport = make(
        transport_class,
        fake_time,
        {
            "/a": [
                reply("tmdb/rate_limited.json", 429, {"Retry-After": "1"}),
                reply("tmdb/movie_60000001.json"),
            ],
            MOVIE: [reply("tmdb/movie_60000001.json")],
        },
    )

    async def burst(count: int) -> None:
        await asyncio.gather(*(client.get(MOVIE) for _ in range(count)))

    async def go() -> tuple[int, int]:
        await client.get("/a")
        transport.starts.clear()
        await burst(30)
        halved = max_starts_in_a_second(transport.starts)
        fake_time.now += 301.0
        transport.starts.clear()
        await burst(20)
        return halved, max_starts_in_a_second(transport.starts)

    halved, restored = run(go())
    assert halved == 10
    assert restored == 20


def test_503_three_times_then_200_succeeds(transport_class, fake_time, reply):
    down = reply("tmdb/rate_limited.json", 503)
    client, transport = make(
        transport_class, fake_time, {MOVIE: [down, down, down, reply("tmdb/movie_60000001.json")]}
    )
    assert isinstance(run(client.get(MOVIE)), dict)
    assert len(transport.requests) == 4
    assert fake_time.sleeps == [1.0, 2.0, 4.0]


def test_four_503s_raise_retry_later(transport_class, fake_time, reply):
    client, transport = make(
        transport_class, fake_time, {MOVIE: [reply("tmdb/rate_limited.json", 503)]}
    )
    with pytest.raises(TmdbRetryLater):
        run(client.get(MOVIE))
    assert len(transport.requests) == 4


def test_a_timeout_counts_as_a_5xx(transport_class, fake_time, reply):
    timeout = httpx.ReadTimeout("slow")
    client, transport = make(
        transport_class, fake_time, {MOVIE: [timeout, timeout, reply("tmdb/movie_60000001.json")]}
    )
    assert isinstance(run(client.get(MOVIE)), dict)
    assert len(transport.requests) == 3

    client, transport = make(transport_class, fake_time, {MOVIE: [timeout]})
    with pytest.raises(TmdbRetryLater):
        run(client.get(MOVIE))
    assert len(transport.requests) == 4


def test_the_client_asks_httpx_for_a_10_second_timeout(transport_class, fake_time):
    client, _ = make(transport_class, fake_time, {})
    assert client._http.timeout == httpx.Timeout(10.0)  # pyright: ignore[reportPrivateUsage]


def test_404_gives_not_found_with_no_retry(transport_class, fake_time, reply):
    client, transport = make(
        transport_class, fake_time, {MOVIE: [reply("tmdb/not_found.json", 404)]}
    )
    assert run(client.get(MOVIE)) == NotFound()
    assert len(transport.requests) == 1
    assert fake_time.sleeps == []


def test_other_4xx_are_errors_not_retries(transport_class, fake_time, reply):
    client, transport = make(
        transport_class, fake_time, {MOVIE: [reply("tmdb/not_found.json", 401)]}
    )
    with pytest.raises(TmdbError):
        run(client.get(MOVIE))
    assert len(transport.requests) == 1


def test_failure_logs_hold_the_path_and_status_never_the_token_or_body(
    transport_class, fake_time, reply, caplog: pytest.LogCaptureFixture
):
    caplog.set_level(logging.DEBUG, logger="server.catalog.tmdb")
    marker = "Your request count is over the allowed limit."
    client, _ = make(transport_class, fake_time, {MOVIE: [reply("tmdb/rate_limited.json", 503)]})
    with pytest.raises(TmdbRetryLater):
        run(client.get(MOVIE, {"language": "fr-FR"}))
    assert MOVIE in caplog.text
    assert "503" in caplog.text
    assert TOKEN not in caplog.text
    assert marker not in caplog.text
    assert "fr-FR" not in caplog.text


def test_an_unrecorded_request_fails_the_test(transport_class, fake_time, reply):
    client, _ = make(transport_class, fake_time, {MOVIE: [reply("tmdb/movie_60000001.json")]})
    with pytest.raises(AssertionError, match="unrecorded request: /movie/60000009"):
        run(client.get("/movie/60000009"))


def test_gives_up_on_endless_429s(transport_class, fake_time, reply):
    client, _ = make(transport_class, fake_time, {MOVIE: [reply("tmdb/rate_limited.json", 429)]})
    with pytest.raises(TmdbRetryLater):
        run(client.get(MOVIE))
