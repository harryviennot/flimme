"""A synthetic `/discover/movie` for the sweep's tests: no network, invented movie ids.

`Discover` answers like TMDB does for one service: a list of films per offer kind (TMDB's
names: flatrate, free, ads), in popularity order, `page_size` to a page, and the year filter
when the request carries `primary_release_year`. It checks the query is the one that
tmdb.md#the-daily-sweep writes, and keeps every request it saw.
"""

import httpx

PATH = "/3/discover/movie"
FIXED_PARAMS = {
    "vote_count.gte": "30",
    "include_adult": "false",
    "sort_by": "popularity.desc",
}


class Discover(httpx.AsyncBaseTransport):
    def __init__(
        self,
        lists: dict[str, list[int]],
        *,
        country: str = "FR",
        provider_id: int,
        page_size: int = 20,
        year_of: dict[int, int] | None = None,
        fail: tuple[str, int] | None = None,
    ) -> None:
        self.lists = lists
        self.country = country
        self.provider_id = provider_id
        self.page_size = page_size
        self.year_of = year_of or {}
        self.fail = fail  # (offer kind, page) that answers 503
        self.requests: list[dict[str, str]] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == PATH, f"unexpected request {request.url.path}"
        params = dict(request.url.params)
        self.requests.append(params)
        for key, value in FIXED_PARAMS.items():
            assert params.get(key) == value, f"{key} should be {value}"
        assert params["watch_region"] == self.country
        assert params["with_watch_providers"] == str(self.provider_id)
        kind = params["with_watch_monetization_types"]
        page = int(params["page"])
        assert 1 <= page <= 500, f"page {page} is out of TMDB's range"
        if self.fail == (kind, page):
            return httpx.Response(503, json={"status_message": "down"})
        films = self.lists.get(kind, [])
        if "primary_release_year" in params:
            year = int(params["primary_release_year"])
            films = [f for f in films if self.year_of.get(f) == year]
        total_pages = -(-len(films) // self.page_size)
        start = (page - 1) * self.page_size
        results = [{"id": film} for film in films[start : start + self.page_size]]
        return httpx.Response(
            200,
            json={
                "page": page,
                "results": results,
                "total_pages": total_pages,
                "total_results": len(films),
            },
        )
