"""`get_list`: the few TMDB endpoints that answer with a JSON array."""

import asyncio

from server.catalog.tmdb import NotFound, TmdbClient


def test_get_list_returns_an_array_body(transport_class, fake_time, reply):
    transport = transport_class(
        {"/configuration/countries": [reply("tmdb/configuration_countries.json")]},
        clock=fake_time.clock,
    )
    client = TmdbClient("t", transport=transport, clock=fake_time.clock, sleep=fake_time.sleep)

    result = asyncio.run(client.get_list("/configuration/countries"))

    assert not isinstance(result, NotFound)
    assert [c["iso_3166_1"] for c in result] == ["FR", "ZY"]
