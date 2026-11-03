"""The sweep's pure parts and its paging, against a synthetic `/discover/movie` (M2.10)."""

import httpx
import pytest
from tests.conftest import FakeTime
from tests.discover import Discover

from server.catalog.fetch import OFFER_KINDS
from server.catalog.sweep import FIRST_YEAR, MAX_PAGES, SweepIncomplete, collect, refuses
from server.catalog.tmdb import TmdbClient, TmdbRetryLater

pytestmark = pytest.mark.anyio

PROVIDER = 60_000_101
FIRST = 60_000_001


def client(transport: httpx.AsyncBaseTransport, fake_time: FakeTime) -> TmdbClient:
    return TmdbClient("token", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)


def test_tmdb_offer_kinds_map_to_ours_and_rent_and_buy_are_not_swept():
    assert OFFER_KINDS == {"flatrate": "subscription", "free": "free", "ads": "ads"}


@pytest.mark.parametrize(
    ("stale", "before", "refused"),
    [
        (0, 0, False),  # a service with no rows has nothing to lose
        (19, 100, False),
        (20, 100, False),  # "more than 20%": exactly 20% goes through
        (21, 100, True),
        (1, 4, True),
        (1, 5, False),
        (5, 5, True),  # everything gone
    ],
)
def test_more_than_a_fifth_of_a_services_rows_is_refused(stale: int, before: int, refused: bool):
    assert refuses(stale, before) is refused


async def test_a_sweep_reads_every_page_of_every_kind_under_our_names(fake_time: FakeTime):
    ids = [FIRST + i for i in range(45)]  # 3 pages of 20
    transport = Discover({"flatrate": ids[:45], "free": ids[:3], "ads": []}, provider_id=PROVIDER)

    seen = await collect(client(transport, fake_time), "FR", PROVIDER, 2026)

    assert seen.by_kind == {
        "subscription": frozenset(ids),
        "free": frozenset(ids[:3]),
        "ads": frozenset(),
    }
    assert seen.year_splits == 0
    flatrate_pages = [
        int(r["page"])
        for r in transport.requests
        if r["with_watch_monetization_types"] == "flatrate"
    ]
    assert flatrate_pages == [1, 2, 3]
    assert not any("primary_release_year" in r for r in transport.requests)


async def test_a_query_over_500_pages_is_split_by_release_year(fake_time: FakeTime):
    # One film a page: 501 pages, one more than TMDB serves. Films are spread over three years.
    ids = [FIRST + i for i in range(MAX_PAGES + 1)]
    year_of = {film: 2000 + n % 3 for n, film in enumerate(ids)}
    transport = Discover({"flatrate": ids}, provider_id=PROVIDER, page_size=1, year_of=year_of)

    seen = await collect(client(transport, fake_time), "FR", PROVIDER, 2026)

    assert seen.by_kind["subscription"] == frozenset(ids)
    assert seen.year_splits > 0
    flatrate = [r for r in transport.requests if r["with_watch_monetization_types"] == "flatrate"]
    years = {int(r["primary_release_year"]) for r in flatrate if "primary_release_year" in r}
    assert years == set(range(FIRST_YEAR, 2027))  # every year, so no film is missed
    assert max(int(r["page"]) for r in flatrate) <= MAX_PAGES


async def test_a_year_that_is_still_over_500_pages_cannot_be_swept_completely(
    fake_time: FakeTime,
):
    ids = [FIRST + i for i in range(MAX_PAGES + 1)]
    transport = Discover(
        {"flatrate": ids}, provider_id=PROVIDER, page_size=1, year_of=dict.fromkeys(ids, 2001)
    )

    with pytest.raises(SweepIncomplete):
        await collect(client(transport, fake_time), "FR", PROVIDER, 2026)


async def test_a_page_that_fails_makes_the_sweep_fail_rather_than_end_short(
    fake_time: FakeTime,
):
    ids = [FIRST + i for i in range(60)]
    transport = Discover({"flatrate": ids}, provider_id=PROVIDER, fail=("flatrate", 2))

    with pytest.raises(TmdbRetryLater):
        await collect(client(transport, fake_time), "FR", PROVIDER, 2026)


async def test_an_answer_that_is_not_a_discover_page_is_an_incomplete_sweep(fake_time: FakeTime):
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"page": 1, "results": "oops"})

    with pytest.raises(SweepIncomplete):
        await collect(client(httpx.MockTransport(handle), fake_time), "FR", PROVIDER, 2026)
