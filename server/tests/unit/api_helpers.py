"""Fakes for the HTTP API's tests: an ES256 key pair made on the spot, the JWKS it would
publish served through httpx's MockTransport, and a database that answers from a set."""

import asyncio
import json
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from jwt.algorithms import ECAlgorithm

from server.api.app import create_app
from server.api.auth import JwksCache, Player, require_player, require_token
from server.config import Environment, Settings

SUPABASE_URL = "https://project.supabase.test"
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
ISSUER = f"{SUPABASE_URL}/auth/v1"


class SigningKey:
    """A throwaway ES256 key pair. Nothing here is a real key."""

    def __init__(self, kid: str) -> None:
        self.kid = kid
        self.private = ec.generate_private_key(ec.SECP256R1())

    def jwk(self) -> dict[str, Any]:
        public = json.loads(ECAlgorithm.to_jwk(self.private.public_key()))
        return {**public, "kid": self.kid, "alg": "ES256", "use": "sig"}

    def sign(self, claims: dict[str, Any]) -> str:
        return jwt.encode(claims, self.private, algorithm="ES256", headers={"kid": self.kid})


def claims(**overrides: Any) -> dict[str, Any]:
    """Good claims; an override of None removes the claim."""
    now = int(time.time())
    base: dict[str, Any] = {
        "sub": "11111111-1111-4111-8111-111111111111",
        "iss": ISSUER,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": now + 3600,
        "iat": now,
        "is_anonymous": False,
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


class JwksServer:
    """What Supabase would answer at the JWKS URL; counts the requests."""

    def __init__(self, *keys: SigningKey) -> None:
        self.keys = list(keys)
        self.requests = 0
        self.fail = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert str(request.url) == JWKS_URL
        self.requests += 1
        if self.fail:
            return httpx.Response(503)
        return httpx.Response(200, json={"keys": [k.jwk() for k in self.keys]})

    def cache(self, clock: Callable[[], float] = time.monotonic) -> JwksCache:
        client = httpx.AsyncClient(transport=httpx.MockTransport(self.handler))
        return JwksCache(JWKS_URL, client, clock=clock)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class FakeConnection:
    def __init__(self, database: "FakeDatabase") -> None:
        self.database = database
        self._params: tuple[Any, ...] = ()
        self._query = ""

    async def execute(self, query: str, params: tuple[Any, ...] = ()) -> "FakeConnection":
        if self.database.hang:
            await asyncio.sleep(60)
        self._query = query
        self._params = params
        return self

    async def fetchone(self) -> tuple[Any, ...]:
        if "http_profile_exists" in self._query:
            return (self._params[0] in self.database.profiles,)
        return (1,)


class FakeDatabase:
    """Stands in for `Database`: `connection()` hands out a connection that knows who has a
    profile. `down` makes the pool fail; `hang` makes a query never answer."""

    def __init__(self, profiles: set[UUID] | None = None) -> None:
        self.profiles = profiles or set()
        self.down = False
        self.hang = False

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[FakeConnection]:
        if self.down:
            raise ConnectionError("pool is down")
        yield FakeConnection(self)

    async def close(self) -> None:
        return None


def make_app(
    server: JwksServer,
    database: FakeDatabase | None = None,
    environment: Environment = Environment.LOCAL,
    cache: JwksCache | None = None,
) -> FastAPI:
    """The real app plus test routes: `/guarded` (profile needed), `/token-only` and `/echo`."""
    settings = Settings(environment=environment, supabase_url=SUPABASE_URL)  # pyright: ignore[reportCallIssue]
    app = create_app(
        settings,
        jwks=cache or server.cache(),
        database=database or FakeDatabase(),  # pyright: ignore[reportArgumentType]
    )

    @app.get("/guarded")
    async def guarded(player: Player = Depends(require_player)) -> dict[str, Any]:  # noqa: B008
        return {"user": str(player.user_id), "anonymous": player.is_anonymous}

    @app.get("/token-only")
    async def token_only(player: Player = Depends(require_token)) -> dict[str, Any]:  # noqa: B008
        return {"user": str(player.user_id), "anonymous": player.is_anonymous}

    @app.post("/echo")
    async def echo(body: dict[str, Any]) -> dict[str, Any]:
        return {"keys": len(body)}

    return app
