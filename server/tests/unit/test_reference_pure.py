"""The pure parts of the reference job: slugs, image sizes and display priorities."""

import pytest
from tests.conftest import fixture_json

from server.catalog.reference import (
    _Configuration,
    _Provider,
    display_priority,
    missing_image_sizes,
    slugify,
)


@pytest.mark.parametrize(
    ("name", "slug"),
    [("Science Fiction", "science_fiction"), ("TV Movie", "tv_movie"), ("Comédie", "comedie")],
)
def test_the_slug_comes_from_the_english_name(name: str, slug: str):
    assert slugify(name) == slug


def test_the_image_configuration_with_every_size_has_nothing_missing():
    config = _Configuration.model_validate(fixture_json("tmdb/configuration.json"))
    assert missing_image_sizes(config) == []


def test_a_lost_size_or_base_url_is_named():
    config = _Configuration.model_validate(fixture_json("tmdb/configuration_missing_size.json"))
    assert missing_image_sizes(config) == ["poster:w342"]
    assert missing_image_sizes(_Configuration()) != []


def test_the_display_priority_is_the_countrys_then_the_default_then_clamped():
    def provider(**kwargs: object) -> _Provider:
        return _Provider.model_validate({"provider_id": 1, "provider_name": "x", **kwargs})

    both = provider(display_priority=9, display_priorities={"FR": 3})
    assert display_priority(both, "FR") == 3
    assert display_priority(both, "US") == 9
    assert display_priority(provider(), "FR") == 100
    assert display_priority(provider(display_priority=10**6), "FR") == 32767
