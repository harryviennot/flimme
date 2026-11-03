"""The pure parts of the refresh schedule (M2.11): the changes window, the agreement share."""

from datetime import UTC, date, datetime, timedelta

import pytest

from server.catalog.refresh import agreement_percent, changes_window

NOW = datetime(2026, 11, 3, 5, 0, tzinfo=UTC)


def test_with_no_earlier_run_the_changes_cover_the_last_24_hours():
    assert changes_window(None, NOW) == (date(2026, 11, 2), date(2026, 11, 3))


def test_after_a_3_day_gap_the_changes_cover_3_days():
    start, end = changes_window(NOW - timedelta(days=3), NOW)
    assert (start, end) == (date(2026, 10, 31), date(2026, 11, 3))
    assert (end - start).days == 3


def test_after_20_days_the_changes_cover_only_14():
    start, end = changes_window(NOW - timedelta(days=20), NOW)
    assert (end - start).days == 14


def test_a_run_that_finished_a_few_hours_ago_still_covers_the_last_day():
    start, end = changes_window(NOW - timedelta(hours=3), NOW)
    assert (end - start).days == 1


@pytest.mark.parametrize(
    ("compared", "disagreements", "expected"),
    [(200, 6, 97.0), (1000, 0, 100.0), (3, 1, 66.67), (0, 0, None)],
)
def test_the_agreement_share_is_the_offers_that_matched(
    compared: int, disagreements: int, expected: float | None
):
    assert agreement_percent(compared, disagreements) == expected
