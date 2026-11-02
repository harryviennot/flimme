"""The export file: reading the top films, and finding the day's file. No database.

The file is a synthetic `.json.gz` in the shape of TMDB's daily export (one JSON object per
line). Nothing is downloaded: the download goes through an `httpx.MockTransport`.
"""

import gzip
import json
from datetime import UTC, date, datetime
from pathlib import Path

import httpx
import pytest

from server.catalog.popularity import (
    ExportSource,
    ExportUnavailable,
    batches,
    export_path,
    latest_ready_day,
    read_export,
)

pytestmark = pytest.mark.anyio

EXPORT = "tmdb/movie_ids_11_02_2026.json.gz"


def lines(fixtures_dir: Path) -> list[bytes]:
    with gzip.open(fixtures_dir / EXPORT, "rb") as handle:
        return handle.read().splitlines()


def test_the_top_leaves_out_adult_and_video_entries(fixtures_dir: Path):
    top, _ = read_export(lines(fixtures_dir), top_n=100, wanted=frozenset())

    # 60000303 is adult and 60000304 is a video: both are more popular than the rest.
    assert top == [
        60000301,
        60000302,
        60000305,
        60000306,
        60000307,
        60000308,
        60000309,
        60000310,
        60000311,
    ]


def test_the_top_is_the_n_most_popular_and_ties_go_to_the_lower_id(fixtures_dir: Path):
    top, _ = read_export(lines(fixtures_dir), top_n=5, wanted=frozenset())

    assert top == [60000301, 60000302, 60000305, 60000306, 60000307]


def test_popularity_is_kept_for_the_wanted_ids_even_outside_the_top(fixtures_dir: Path):
    top, popularity = read_export(
        lines(fixtures_dir), top_n=2, wanted=frozenset({60000301, 60000311, 60000999})
    )

    assert top == [60000301, 60000302]
    assert popularity == {60000301: 90.5, 60000311: 0.6}  # 60000999 is not in the file


def test_a_line_that_is_not_an_export_entry_is_skipped():
    top, _ = read_export(
        [b"", b"not json", b'{"id": "x"}', b'{"id": 60000301, "popularity": 1.5}'],
        top_n=10,
        wanted=frozenset(),
    )

    assert top == [60000301]


def test_batches_are_at_most_the_size_asked():
    assert list(batches([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]
    assert list(batches([], 100)) == []


def test_the_file_is_ready_from_0800_utc():
    assert latest_ready_day(datetime(2026, 11, 2, 8, 0, tzinfo=UTC)) == date(2026, 11, 2)
    assert latest_ready_day(datetime(2026, 11, 2, 7, 59, tzinfo=UTC)) == date(2026, 11, 1)
    assert latest_ready_day(datetime(2026, 3, 1, 3, 0, tzinfo=UTC)) == date(2026, 2, 28)


def test_the_path_is_the_one_tmdb_publishes():
    assert export_path(date(2026, 1, 9)) == "/p/exports/movie_ids_01_09_2026.json.gz"


def transport(fixtures_dir: Path, available: set[str]) -> httpx.MockTransport:
    body = (fixtures_dir / EXPORT).read_bytes()

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "files.tmdb.org"
        assert "authorization" not in request.headers  # the file needs no key
        if request.url.path in available:
            return httpx.Response(200, content=body)
        if request.url.path.startswith("/p/exports/"):
            return httpx.Response(404)
        raise AssertionError(f"unexpected request {request.url}")

    return httpx.MockTransport(handle)


async def test_the_file_is_downloaded_and_read(fixtures_dir: Path):
    source = ExportSource(
        transport=transport(fixtures_dir, {"/p/exports/movie_ids_11_02_2026.json.gz"}),
        clock=lambda: datetime(2026, 11, 2, 9, 0, tzinfo=UTC),
    )

    export = await source.load(top_n=3, wanted=frozenset())

    assert export.day == date(2026, 11, 2)
    assert export.top == [60000301, 60000302, 60000305]


async def test_yesterdays_file_stands_in_when_todays_is_not_there_yet(fixtures_dir: Path):
    source = ExportSource(
        transport=transport(fixtures_dir, {"/p/exports/movie_ids_11_02_2026.json.gz"}),
        clock=lambda: datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
    )

    export = await source.load(top_n=3, wanted=frozenset())

    assert export.day == date(2026, 11, 2)


async def test_a_named_day_is_the_only_one_tried(fixtures_dir: Path):
    source = ExportSource(
        transport=transport(fixtures_dir, {"/p/exports/movie_ids_11_02_2026.json.gz"}),
        clock=lambda: datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
    )

    with pytest.raises(ExportUnavailable):
        await source.load(top_n=3, wanted=frozenset(), day=date(2026, 11, 3))


async def test_no_file_in_three_days_is_unavailable(fixtures_dir: Path):
    source = ExportSource(
        transport=transport(fixtures_dir, set()),
        clock=lambda: datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
    )

    with pytest.raises(ExportUnavailable):
        await source.load(top_n=3, wanted=frozenset())


def test_the_export_fixture_uses_only_invented_ids(fixtures_dir: Path):
    ids = [json.loads(line)["id"] for line in lines(fixtures_dir)]

    assert ids and min(ids) >= 60_000_001
