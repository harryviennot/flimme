"""The curation file: its format, and the ages and countries Harry decided (Q12, Q13)."""

import pytest
from pydantic import ValidationError

from server.catalog.curation import Curation, load_curation


def test_the_committed_file_enables_france_in_french():
    curation = load_curation()
    assert curation.countries["FR"].enabled is True
    assert curation.countries["FR"].language == "fr"


def test_the_committed_age_policy_is_the_decided_one():
    ages = load_curation().certification_ages
    assert ages["FR"] == {"U": 0, "10": 10, "12": 12, "16": 16, "18": 18}
    assert ages["US"] == {"G": 0, "PG": 7, "PG-13": 13, "R": 17, "NC-17": 18}


def test_a_services_section_holds_ids_and_flags_only():
    curation = Curation.model_validate(
        {
            "services": {
                "FR": {"listed": [1, 2], "free": [3], "variants": {"4": 1}, "order": {"1": 5}}
            }
        }
    )
    france = curation.services["FR"]
    assert (france.listed, france.free, france.variants, france.order) == (
        [1, 2],
        [3],
        {4: 1},
        {1: 5},
    )


@pytest.mark.parametrize(
    "bad",
    [
        {"certification_ages": {"FR": {"U": 22}}},
        {"certification_ages": {"fr": {"U": 0}}},
        {"countries": {"FR": {"enabled": True, "language": "fr", "name": "France"}}},
        {"services": {"FR": {"listed": [1], "free": [1]}}},
        {"services": {"FR": {"variants": {"1": 1}}}},
        {"services": {"FR": {"listed": [4], "variants": {"4": 1}}}},
    ],
)
def test_a_malformed_file_is_refused(bad: dict[str, object]):
    with pytest.raises(ValidationError):
        Curation.model_validate(bad)
