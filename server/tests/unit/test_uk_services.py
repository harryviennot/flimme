"""The United Kingdom's committed service list (M24.6): the rules that hold whatever Harry signs
off, and the choices he made on 9 Nov 2026.

Ids and flags only (decision Q12); names live in comments. That every id is in TMDB's GB
provider list, and each service's offer kinds, were checked against TMDB that day and are
recorded in the pull request.
"""

from server.catalog.curation import ServicesCuration, load_curation

# TMDB provider ids.
NETFLIX, PRIME_VIDEO_GB, PRIME_VIDEO_FR, SKY_GO, NOW, HBO_MAX = 8, 9, 119, 29, 591, 1899
BBC_IPLAYER = 38
ITVX, CHANNEL_4, FIVE, TUBI, PLUTO, PLEX, PRIME_FREE_WITH_ADS = 41, 103, 333, 73, 300, 538, 613
ITVX_PREMIUM, CHANNEL_4_PLUS, CURZON_HOME_CINEMA = 2300, 2311, 189


def uk() -> ServicesCuration:
    return load_curation().services["GB"]


def test_the_uk_lists_services():
    services = uk()
    assert services.listed
    assert services.free
    assert services.variants


def test_every_variant_points_at_a_listed_service():
    services = uk()
    for child, parent in services.variants.items():
        assert parent in services.listed, f"variant {child} points at {parent}, which is not listed"


def test_no_service_is_both_listed_and_free():
    services = uk()
    assert not set(services.listed) & set(services.free)


def test_no_variant_is_listed_or_free():
    services = uk()
    assert not set(services.variants) & set(services.listed)
    assert not set(services.variants) & set(services.free)


def test_no_id_is_repeated():
    services = uk()
    assert len(set(services.listed)) == len(services.listed)
    assert len(set(services.free)) == len(services.free)


def test_the_picker_holds_the_twelve_services_and_bbc_iplayer():
    services = uk()
    assert len(services.listed) == 13
    assert {NETFLIX, PRIME_VIDEO_GB, SKY_GO, NOW, HBO_MAX} <= set(services.listed)
    # Prime Video is 9 in the UK; France's 119 is not a UK service.
    assert PRIME_VIDEO_FR not in services.listed
    # BBC iPlayer needs a TV licence, so players pick it: listed, not free.
    assert BBC_IPLAYER in services.listed
    assert BBC_IPLAYER not in services.free


def test_the_free_services_are_the_ad_supported_ones_chosen():
    assert set(uk().free) == {ITVX, CHANNEL_4, FIVE, TUBI, PLUTO, PLEX, PRIME_FREE_WITH_ADS}


def test_paid_tiers_of_free_services_and_rental_stores_are_left_out():
    services = uk()
    everything = set(services.listed) | set(services.free) | set(services.variants)
    assert not {ITVX_PREMIUM, CHANNEL_4_PLUS, CURZON_HOME_CINEMA} & everything


def test_the_uk_keeps_tmdb_display_order():
    assert uk().order == {}
