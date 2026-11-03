"""France's committed service list (M2.6): the rules that hold whatever Harry signs off.

Ids and flags only (decision Q12); names live in comments. That every id exists in staging's
`providers` was checked by hand and is recorded in the pull request.
"""

from server.catalog.curation import ServicesCuration, load_curation


def france() -> ServicesCuration:
    return load_curation().services["FR"]


def test_france_lists_services():
    services = france()
    assert services.listed
    assert services.free
    assert services.variants


def test_every_variant_points_at_a_listed_service():
    services = france()
    for child, parent in services.variants.items():
        assert parent in services.listed, f"variant {child} points at {parent}, which is not listed"


def test_no_service_is_both_listed_and_free():
    services = france()
    assert not set(services.listed) & set(services.free)


def test_no_variant_is_listed_or_free():
    services = france()
    assert not set(services.variants) & set(services.listed)
    assert not set(services.variants) & set(services.free)


def test_no_id_is_repeated():
    services = france()
    assert len(set(services.listed)) == len(services.listed)
    assert len(set(services.free)) == len(services.free)


def test_the_french_services_that_matter_are_set_with_their_confirmed_ids():
    services = france()
    # Confirmed against staging's providers: Canal+, TF1+, M6+, Cine+ OCS (Amazon channel).
    assert {381, 1754, 147, 685} <= set(services.listed)
    # Arte is a free service, not a listed one.
    assert 234 in services.free
