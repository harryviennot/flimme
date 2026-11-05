import logging
import time
from typing import Any
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient
from httpx2 import Response
from tests.unit.api_helpers import (
    Clock,
    FakeDatabase,
    JwksServer,
    SigningKey,
    claims,
    make_app,
)

from server.config import Environment

USER = UUID("11111111-1111-4111-8111-111111111111")
UNAUTHORIZED = {"status": "unauthorized"}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def key() -> SigningKey:
    return SigningKey("key-1")


@pytest.fixture
def server(key: SigningKey) -> JwksServer:
    return JwksServer(key)


def client_for(server: JwksServer, database: FakeDatabase | None = None) -> TestClient:
    return TestClient(make_app(server, database or FakeDatabase({USER})))


def assert_refused(response: Response) -> None:
    assert response.status_code == 401
    assert response.json() == UNAUTHORIZED
    assert response.headers["www-authenticate"] == "Bearer"


def test_a_good_token_reaches_the_route_with_its_player(
    server: JwksServer, key: SigningKey
) -> None:
    response = client_for(server).get(
        "/guarded", headers=bearer(key.sign(claims(is_anonymous=True)))
    )

    assert response.status_code == 200
    assert response.json() == {"user": str(USER), "anonymous": True}


def test_a_token_5_seconds_past_expiry_is_accepted_and_11_is_not(
    server: JwksServer, key: SigningKey
) -> None:
    client = client_for(server)
    now = int(time.time())

    accepted = client.get("/token-only", headers=bearer(key.sign(claims(exp=now - 5))))
    assert accepted.status_code == 200
    assert_refused(client.get("/token-only", headers=bearer(key.sign(claims(exp=now - 11)))))


def test_a_token_signed_by_another_key_with_the_same_kid_is_refused(server: JwksServer) -> None:
    forger = SigningKey("key-1")

    assert_refused(client_for(server).get("/token-only", headers=bearer(forger.sign(claims()))))


def test_hs256_and_alg_none_are_refused(server: JwksServer, key: SigningKey) -> None:
    client = client_for(server)
    shared = "a-shared-secret-of-at-least-thirty-two-bytes"
    hs256 = jwt.encode(claims(), shared, algorithm="HS256", headers={"kid": key.kid})
    unsigned = jwt.encode(claims(), "", algorithm="none", headers={"kid": key.kid})  # pyright: ignore[reportArgumentType]

    assert_refused(client.get("/token-only", headers=bearer(hs256)))
    assert_refused(client.get("/token-only", headers=bearer(unsigned)))


@pytest.mark.parametrize(
    "override",
    [
        {"iss": "https://elsewhere.test/auth/v1"},
        {"aud": "somebody-else"},
        {"aud": None},
        {"role": "anon"},
        {"role": "service_role"},
        {"role": None},
        {"exp": None},
        {"sub": None},
        {"sub": "not-a-uuid"},
    ],
)
def test_wrong_claims_are_refused(
    server: JwksServer, key: SigningKey, override: dict[str, Any]
) -> None:
    token = key.sign(claims(**override))

    assert_refused(client_for(server).get("/token-only", headers=bearer(token)))


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer"}, {"Authorization": "Bearer "}],
)
def test_no_bearer_token_is_refused_with_www_authenticate(
    server: JwksServer, headers: dict[str, str]
) -> None:
    assert_refused(client_for(server).get("/token-only", headers=headers))


def test_garbage_is_refused(server: JwksServer) -> None:
    assert_refused(client_for(server).get("/token-only", headers=bearer("not.a.jwt")))


def test_an_unknown_kid_refetches_once_and_a_second_one_within_10_minutes_does_not(
    key: SigningKey,
) -> None:
    rotated = SigningKey("key-2")
    server = JwksServer(key)
    clock = Clock()
    client = TestClient(make_app(server, FakeDatabase({USER}), cache=server.cache(clock)))
    assert client.get("/token-only", headers=bearer(key.sign(claims()))).status_code == 200
    assert server.requests == 1

    server.keys = [key, rotated]
    assert client.get("/token-only", headers=bearer(rotated.sign(claims()))).status_code == 200
    assert server.requests == 2

    for kid in ("ghost-1", "ghost-2", "ghost-1"):
        assert_refused(client.get("/token-only", headers=bearer(SigningKey(kid).sign(claims()))))
    assert server.requests == 2  # the rotation refetch just happened: no ghost may refetch yet

    clock.now += 601
    assert_refused(client.get("/token-only", headers=bearer(SigningKey("ghost-3").sign(claims()))))
    assert_refused(client.get("/token-only", headers=bearer(SigningKey("ghost-4").sign(claims()))))
    assert server.requests == 3  # one refetch for the whole flood


def test_the_cache_refetches_after_10_minutes(server: JwksServer, key: SigningKey) -> None:
    clock = Clock()
    client = TestClient(make_app(server, FakeDatabase({USER}), cache=server.cache(clock)))
    headers = bearer(key.sign(claims()))

    client.get("/token-only", headers=headers)
    clock.now += 599
    client.get("/token-only", headers=headers)
    assert server.requests == 1

    clock.now += 2
    client.get("/token-only", headers=headers)
    assert server.requests == 2


def test_a_failed_refetch_is_a_401_not_a_crash(key: SigningKey) -> None:
    server = JwksServer(key)
    clock = Clock()
    client = TestClient(make_app(server, FakeDatabase({USER}), cache=server.cache(clock)))
    headers = bearer(key.sign(claims()))
    assert client.get("/token-only", headers=headers).status_code == 200

    server.fail = True
    clock.now += 601
    assert_refused(client.get("/token-only", headers=headers))

    server.fail = False
    clock.now += 31
    assert client.get("/token-only", headers=headers).status_code == 200


def test_a_first_fetch_that_fails_is_a_401(key: SigningKey) -> None:
    server = JwksServer(key)
    server.fail = True

    assert_refused(client_for(server).get("/token-only", headers=bearer(key.sign(claims()))))


def test_a_valid_token_without_a_profile_is_403_for_require_player_only(
    server: JwksServer, key: SigningKey
) -> None:
    client = client_for(server, FakeDatabase(set()))
    headers = bearer(key.sign(claims()))

    guarded = client.get("/guarded", headers=headers)
    assert guarded.status_code == 403
    assert guarded.json() == {"status": "no_profile"}
    assert client.get("/token-only", headers=headers).status_code == 200


def test_a_refused_token_logs_its_kind_and_none_of_the_token(
    server: JwksServer, key: SigningKey, caplog: pytest.LogCaptureFixture
) -> None:
    client = client_for(server)
    expired = key.sign(claims(exp=int(time.time()) - 60))
    forged = SigningKey("key-1").sign(claims())
    caplog.set_level(logging.INFO)

    client.get("/token-only", headers=bearer(expired))
    client.get("/token-only", headers=bearer(forged))
    client.get("/token-only")

    text = caplog.text
    assert "expired" in text
    assert "bad_signature" in text
    assert "missing" in text
    for token in (expired, forged):
        for part in token.split("."):
            assert part not in text


def test_openapi_is_off_outside_local(server: JwksServer) -> None:
    for environment in (Environment.STAGING, Environment.PRODUCTION):
        client = TestClient(make_app(server, environment=environment))
        for path in ("/openapi.json", "/docs", "/redoc"):
            assert client.get(path).status_code == 404

    assert TestClient(make_app(server)).get("/openapi.json").status_code == 200


def test_a_failing_key_server_is_asked_once_whatever_arrives(key: SigningKey) -> None:
    server = JwksServer(key)
    server.fail = True
    clock = Clock()
    client = TestClient(make_app(server, FakeDatabase({USER}), cache=server.cache(clock)))

    for kid in ("a", "b", "c", "key-1", "d"):
        assert_refused(client.get("/token-only", headers=bearer(SigningKey(kid).sign(claims()))))

    assert server.requests == 1

    clock.now += 31
    assert_refused(client.get("/token-only", headers=bearer(SigningKey("e").sign(claims()))))
    assert server.requests == 2
