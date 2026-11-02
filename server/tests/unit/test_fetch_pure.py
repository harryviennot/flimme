"""`build_film_rows`: one TMDB response in, the rows to write out. No database, no network.

The response is a synthetic one in TMDB's shape (tests/fixtures/tmdb/movie_full_60000010.json).
Each test changes the part it is about.
"""

import copy
import math
from dataclasses import replace
from datetime import date
from typing import Any

from tests.conftest import fixture_json

from server.catalog.fetch import FetchContext, FilmRows, build_film_rows, quality_score

FIRST_SERVICE = 60_000_201
FREE_SERVICE = 60_000_202
VARIANT_SERVICE = 60_000_203

CONTEXT = FetchContext(
    enabled_countries=frozenset({"FR"}),
    swept={"FR": frozenset({FIRST_SERVICE, FREE_SERVICE, VARIANT_SERVICE})},
    ages={
        ("FR", "U"): 0,
        ("FR", "10"): 10,
        ("FR", "12"): 12,
        ("FR", "16"): 16,
        ("US", "PG-13"): 13,
    },
    catalog_average=6.5,
)


def response() -> dict[str, Any]:
    return copy.deepcopy(fixture_json("tmdb/movie_full_60000010.json"))


def build(body: dict[str, Any] | None = None, context: FetchContext = CONTEXT) -> FilmRows:
    return build_film_rows(response() if body is None else body, context)


def release(country: str, *entries: tuple[str, int, str]) -> dict[str, Any]:
    return {
        "iso_3166_1": country,
        "release_dates": [
            {"certification": cert, "type": kind, "release_date": date, "iso_639_1": ""}
            for cert, kind, date in entries
        ],
    }


def test_a_full_response_fills_every_part():
    rows = build()

    title = rows.title
    assert (title.tmdb_id, title.imdb_id, title.original_title) == (
        60_000_010,
        "tt9000010",
        "Film invente dix",
    )
    assert (title.original_language, str(title.release_date), title.runtime_min) == (
        "fr",
        "2019-06-05",
        104,
    )
    assert title.genre_ids == [18, 35]
    assert title.keyword_ids == [98_000_001, 98_000_002]
    assert title.collection_id == 98_000_900
    assert (title.popularity, title.vote_average, title.vote_count) == (33.3, 7.4, 1250)
    assert (title.poster_path, title.backdrop_path, title.is_adult) == (
        "/fixture-poster-en.jpg",
        "/fixture-backdrop.jpg",
        False,
    )
    assert title.trailer_key == "trailerEn001"

    assert {t.language: t.title for t in rows.translations} == {
        "en": "Invented film ten",
        "fr": "Film invente dix",
    }
    english = next(t for t in rows.translations if t.language == "en")
    assert (english.overview, english.tagline) == (
        "An invented English overview.",
        "An invented English tagline.",
    )
    assert [k.id for k in rows.keywords] == [98_000_001, 98_000_002]

    directors = [c for c in rows.credits if c.role == "director"]
    writers = [c for c in rows.credits if c.role == "writer"]
    cast = [c for c in rows.credits if c.role == "cast"]
    assert [c.person_id for c in directors] == [97_000_001, 97_000_002]
    assert [c.person_id for c in writers] == [97_000_011, 97_000_012, 97_000_013]
    assert [c.person_id for c in cast] == [97_000_100 + i for i in range(8)]
    assert [c.ord for c in cast] == list(range(8))
    assert {c.person_id for c in rows.credits} <= {p.id for p in rows.people}

    assert [
        (c.country, c.certification, c.min_age, c.inferred_from) for c in rows.certifications
    ] == [("FR", "12", 12, None)]
    assert [(o.country, o.provider_id, o.kind) for o in rows.offers] == [
        ("FR", FIRST_SERVICE, "subscription"),
        ("FR", FREE_SERVICE, "ads"),
        ("FR", FREE_SERVICE, "free"),
        ("FR", VARIANT_SERVICE, "subscription"),
    ]
    assert [(w.country, w.link) for w in rows.watch_links] == [
        ("FR", "https://www.example.invalid/watch/fr/60000010")
    ]


def test_france_french_beats_canadian_french():
    french = next(t for t in build().translations if t.language == "fr")

    assert french.title == "Film invente dix"
    assert french.overview == "Un resume invente de France."


def test_another_french_is_used_when_france_has_none():
    body = response()
    body["translations"]["translations"] = [
        t for t in body["translations"]["translations"] if t["iso_3166_1"] != "FR"
    ]

    french = next(t for t in build(body).translations if t.language == "fr")

    assert french.title == "Film invente dix (CA)"


def test_an_empty_french_overview_stays_null_and_an_empty_title_uses_english():
    body = response()
    for t in body["translations"]["translations"]:
        if t["iso_639_1"] == "fr":
            t["data"]["title"] = ""
            t["data"]["overview"] = ""
    body["translations"]["translations"][2]["data"]["overview"] = "Un resume."

    french = next(t for t in build(body).translations if t.language == "fr")

    assert french.title == "Invented film ten"
    assert french.overview == "Un resume."
    assert french.tagline is None

    body["translations"]["translations"][2]["data"]["overview"] = ""
    assert [t.language for t in build(body).translations] == ["en"]


def test_an_empty_french_overview_beside_a_french_title_is_null():
    body = response()
    body["translations"]["translations"][2]["data"]["overview"] = ""

    french = next(t for t in build(body).translations if t.language == "fr")

    assert french.title == "Film invente dix"
    assert french.overview is None


def test_the_french_row_takes_the_best_voted_french_poster():
    french = next(t for t in build().translations if t.language == "fr")

    assert french.poster_path == "/fixture-poster-fr-best.jpg"


def test_without_a_french_poster_the_french_poster_is_null():
    body = response()
    body["images"]["posters"] = [p for p in body["images"]["posters"] if p["iso_639_1"] != "fr"]

    french = next(t for t in build(body).translations if t.language == "fr")

    assert french.poster_path is None


def test_the_certification_comes_from_the_most_recent_theatrical_release():
    body = response()
    body["release_dates"]["results"] = [
        release(
            "FR",
            ("16", 4, "2020-01-01T00:00:00.000Z"),
            ("10", 3, "2019-05-01T00:00:00.000Z"),
            ("12", 3, "2019-06-05T00:00:00.000Z"),
        )
    ]

    assert [c.certification for c in build(body).certifications] == ["12"]


def test_certification_type_order_is_theatrical_then_digital_then_tv_then_any():
    def certification(*entries: tuple[str, int, str]) -> str | None:
        body = response()
        body["release_dates"]["results"] = [release("FR", *entries)]
        found = build(body).certifications
        return found[0].certification if found else None

    day = "2019-01-01T00:00:00.000Z"
    later = "2020-01-01T00:00:00.000Z"
    assert certification(("U", 6, later), ("16", 4, later), ("12", 3, day)) == "12"
    assert certification(("U", 6, later), ("16", 4, day), ("", 3, later)) == "16"
    assert certification(("U", 6, day), ("10", 1, later)) == "U"
    assert certification(("10", 1, day), ("16", 2, later)) == "16"


def test_a_missing_certification_falls_back_to_the_us_one_and_says_so():
    body = response()
    body["release_dates"]["results"] = [release("US", ("PG-13", 3, "2019-06-07T00:00:00.000Z"))]

    found = build(body).certifications

    assert [(c.country, c.certification, c.min_age, c.inferred_from) for c in found] == [
        ("FR", "PG-13", 13, "US")
    ]


def test_a_country_with_only_empty_certifications_falls_back_to_the_us_one():
    body = response()
    body["release_dates"]["results"] = [
        release("FR", ("", 3, "2019-06-05T00:00:00.000Z")),
        release("US", ("PG-13", 3, "2019-06-07T00:00:00.000Z")),
    ]

    assert [(c.certification, c.inferred_from) for c in build(body).certifications] == [
        ("PG-13", "US")
    ]


def test_no_certification_anywhere_writes_no_row():
    body = response()
    body["release_dates"]["results"] = [release("FR", ("", 3, "2019-06-05T00:00:00.000Z"))]

    assert build(body).certifications == ()


def test_a_certification_without_an_age_row_keeps_a_null_age():
    body = response()
    body["release_dates"]["results"] = [release("FR", ("X", 3, "2019-06-05T00:00:00.000Z"))]

    found = build(body).certifications

    assert [(c.certification, c.min_age) for c in found] == [("X", None)]


def test_flatrate_becomes_subscription_and_rent_and_buy_are_dropped():
    kinds = {o.kind for o in build().offers}

    assert kinds == {"subscription", "free", "ads"}


def test_offers_outside_the_swept_set_or_the_enabled_countries_are_dropped():
    offers = {(o.country, o.provider_id) for o in build().offers}

    assert ("FR", 60_000_299) not in offers
    assert not any(country == "DE" for country, _ in offers)


def test_the_watch_link_is_kept_only_for_enabled_countries():
    assert [w.country for w in build().watch_links] == ["FR"]


def test_the_trailer_is_the_official_english_trailer_first():
    assert build().title.trailer_key == "trailerEn001"


def test_the_trailer_falls_back_to_french_then_to_a_teaser():
    def trailer(drop: set[str]) -> str | None:
        body = response()
        body["videos"]["results"] = [v for v in body["videos"]["results"] if v["key"] not in drop]
        return build(body).title.trailer_key

    assert trailer({"trailerEn001"}) == "trailerFr001"
    assert trailer({"trailerEn001", "trailerFr001"}) == "teaserEn0001"
    assert trailer({"trailerEn001", "trailerFr001", "teaserEn0001"}) is None


def test_the_quality_score_follows_the_formula():
    average = 6.5
    forty = quality_score(9.0, 40, average)
    big = quality_score(8.4, 20_000, average)

    assert forty is not None and big is not None
    assert math.isclose(forty, (40 / 140) * 9.0 + (100 / 140) * average)
    assert math.isclose(big, (20_000 / 20_100) * 8.4 + (100 / 20_100) * average)
    assert big > forty  # a 9.0 from 40 votes doesn't outrank an 8.4 from 20,000


def test_the_quality_score_is_null_until_a_first_catalog_average_exists():
    assert quality_score(8.0, 500, None) is None
    no_average = FetchContext(CONTEXT.enabled_countries, CONTEXT.swept, CONTEXT.ages, None)
    assert build(context=no_average).title.quality_score is None


def test_the_built_row_carries_the_quality_score():
    score = build().title.quality_score

    assert score is not None
    assert math.isclose(score, quality_score(7.4, 1250, 6.5) or 0.0)


def test_tier_one_when_watchable_by_subscription_free_or_ads_else_two():
    assert build().title.refresh_tier == 1

    body = response()
    body["watch/providers"]["results"]["FR"].pop("flatrate")
    body["watch/providers"]["results"]["FR"].pop("free")
    assert build(body).title.refresh_tier == 1  # still ads

    body["watch/providers"]["results"]["FR"].pop("ads")
    assert build(body).title.refresh_tier == 2  # rent and buy don't count

    body["watch/providers"]["results"] = {}
    assert build(body).title.refresh_tier == 2


def test_an_offer_outside_the_swept_set_does_not_make_a_film_tier_one():
    body = response()
    body["watch/providers"]["results"]["FR"] = {
        "link": "https://www.example.invalid/watch/fr/60000010",
        "flatrate": [{"provider_id": 60_000_299}],
    }

    assert build(body).title.refresh_tier == 2


def test_empty_fields_become_null_and_a_zero_runtime_is_dropped():
    body = response()
    body.update({"release_date": "", "runtime": 0, "imdb_id": "", "belongs_to_collection": None})

    title = build(body).title

    assert (title.release_date, title.runtime_min, title.imdb_id, title.collection_id) == (
        None,
        None,
        None,
        None,
    )


def test_a_missing_part_leaves_its_rows_empty():
    body = response()
    for part in ("translations", "keywords", "credits", "release_dates", "videos", "images"):
        body.pop(part)
    body.pop("watch/providers")

    rows = build(body)

    assert [t.language for t in rows.translations] == ["en"]
    assert rows.keywords == () and rows.credits == () and rows.certifications == ()
    assert rows.offers == () and rows.watch_links == ()
    assert rows.title.trailer_key is None


# --- The floor (tmdb.md#which-films-are-in-the-catalog): released, 40 minutes, 30 votes, not adult.

TODAY = date(2026, 11, 2)
WITH_TODAY = replace(CONTEXT, today=TODAY)


def failures(**changes: Any) -> tuple[str, ...]:
    body = response()
    body.update(changes)
    return build(body, WITH_TODAY).floor_failures


def test_a_film_that_passes_every_rule_has_no_failure():
    assert failures() == ()


def test_the_floor_rejects_a_status_that_is_not_released():
    assert failures(status="Post Production") == ("not_released",)
    assert failures(status=None) == ("not_released",)


def test_the_floor_rejects_a_release_date_that_is_not_past():
    assert failures(release_date="2026-11-03") == ("not_released",)
    assert failures(release_date="") == ("not_released",)
    assert failures(release_date="2026-11-02") == ()  # today counts as released


def test_the_floor_rejects_a_film_under_40_minutes():
    assert failures(runtime=39) == ("too_short",)
    assert failures(runtime=40) == ()
    assert failures(runtime=None) == ("too_short",)
    assert failures(runtime=0) == ("too_short",)


def test_the_floor_rejects_a_film_under_30_votes():
    assert failures(vote_count=29) == ("too_few_votes",)
    assert failures(vote_count=30) == ()
    assert failures(vote_count=None) == ("too_few_votes",)


def test_the_floor_rejects_an_adult_film():
    assert failures(adult=True) == ("adult",)


def test_every_rule_that_fails_is_named():
    assert failures(status="Rumored", runtime=10, vote_count=1, adult=True) == (
        "not_released",
        "too_short",
        "too_few_votes",
        "adult",
    )
