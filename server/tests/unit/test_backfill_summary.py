"""The line `server backfill` prints about its own pace (totals only)."""

from server.catalog.backfill import BACKFILL_POOL_SIZE, BackfillResult, summary_line
from server.catalog.fetch import CONCURRENCY, PHASES


def test_the_summary_gives_films_a_second_and_each_phase_share():
    result = BackfillResult(
        1,
        100,
        False,
        6.5,
        100,
        films=200,
        fetch_seconds=100.0,
        phase_ms={
            "ms_tmdb": 100,
            "ms_poster": 100,
            "ms_pool_wait": 400,
            "ms_read": 0,
            "ms_write": 400,
        },
    )

    line = summary_line(result)

    assert "200 films in 100 s, 2.0 films a second" in line
    assert "tmdb 10%" in line and "waiting for a connection 40%" in line and "write 40%" in line
    assert "\n" not in line


def test_the_summary_survives_a_run_with_nothing_to_fetch():
    line = summary_line(BackfillResult(1, 0, True, None, 0))

    assert "0 films" in line and "0.0 films a second" in line
    assert all(name not in line for name in PHASES)


def test_the_backfill_pool_fits_every_film_in_flight_plus_the_bookkeeping():
    assert BACKFILL_POOL_SIZE == CONCURRENCY + 1
