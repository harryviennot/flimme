"""Token checks for the HTTP API (security.md#the-servers-http-api-and-letterboxd-uploads).

Every route but `/healthz` takes the player's Supabase access token as a bearer token. The
signature is checked against the project's published signing keys, ES256 only: the legacy
shared secret is never accepted, and neither is `alg: none`. Whatever fails, the answer is one
`401 {"status": "unauthorized"}`; the log names the kind of failure, never the token.

`require_token` checks the token. `require_player` also checks that the user has a profile.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

import httpx
import jwt
from fastapi import Request
from jwt.algorithms import ECAlgorithm

from server.api.errors import ApiError, no_profile, unauthorized

logger = logging.getLogger(__name__)

CACHE_SECONDS = 600
RETRY_AFTER_FAILURE_SECONDS = 30
EXP_LEEWAY_SECONDS = 10
FETCH_TIMEOUT_SECONDS = 5

Failure = Literal["missing", "expired", "bad_signature", "unknown_kid", "bad_claims"]


@dataclass(frozen=True)
class Player:
    user_id: UUID
    is_anonymous: bool


class JwksCache:
    """The project's public signing keys, in memory.

    Kept for 10 minutes. An unknown key id refetches once, so rotation works, but never more
    than once per 10 minutes whatever ids arrive, so forged ids cannot hammer Supabase. A
    failed fetch is not tried again for 30 seconds, whatever arrives. If the cache is out of
    date and cannot be renewed, nothing is trusted (every key is "unknown"); if a refetch for
    an unknown id fails, the fresh keys we hold stay.
    """

    def __init__(
        self,
        url: str,
        client: httpx.AsyncClient,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._url = url
        self._client = client
        self._clock = clock
        self._keys: dict[str, Any] = {}
        self._fetched_at: float | None = None
        self._unknown_refetch_at: float | None = None
        self._retry_after: float | None = None
        self._lock = asyncio.Lock()

    async def key_for(self, kid: str) -> Any | None:
        async with self._lock:
            now = self._clock()
            if self._retry_after is not None and now < self._retry_after:
                return self._keys.get(kid)  # a fetch just failed: leave Supabase alone
            refetched = False
            if self._fetched_at is None or now - self._fetched_at >= CACHE_SECONDS:
                if not await self._fetch():
                    # Out of date and cannot be renewed: trust nothing we hold.
                    self._keys = {}
                    self._fetched_at = None
                refetched = True
            if kid in self._keys:
                return self._keys[kid]
            if refetched:
                self._unknown_refetch_at = now
                return None
            throttled = (
                self._unknown_refetch_at is not None
                and now - self._unknown_refetch_at < CACHE_SECONDS
            )
            if throttled:
                return None
            self._unknown_refetch_at = now
            await self._fetch()
            return self._keys.get(kid)

    async def _fetch(self) -> bool:
        try:
            response = await self._client.get(self._url, timeout=FETCH_TIMEOUT_SECONDS)
            response.raise_for_status()
            keys: dict[str, Any] = {}
            for jwk in response.json()["keys"]:
                if jwk.get("kty") == "EC" and jwk.get("crv") == "P-256" and "kid" in jwk:
                    keys[jwk["kid"]] = ECAlgorithm.from_jwk(jwk)
        except Exception as error:
            logger.warning("signing keys: fetch failed (%s)", type(error).__name__)
            self._retry_after = self._clock() + RETRY_AFTER_FAILURE_SECONDS
            return False
        self._retry_after = None
        self._keys = keys
        self._fetched_at = self._clock()
        return True


def _refuse(kind: Failure) -> ApiError:
    logger.info("token refused: %s", kind)
    return unauthorized()


async def _verify(request: Request) -> Player:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise _refuse("missing")

    try:
        unverified = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _refuse("bad_signature") from None
    kid = unverified.get("kid")
    if unverified.get("alg") != "ES256" or not isinstance(kid, str):
        raise _refuse("bad_signature")

    cache: JwksCache = request.app.state.jwks
    key = await cache.key_for(kid)
    if key is None:
        raise _refuse("unknown_kid")

    issuer: str = request.app.state.issuer
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=issuer,
            leeway=EXP_LEEWAY_SECONDS,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError:
        raise _refuse("expired") from None
    except jwt.InvalidSignatureError:
        raise _refuse("bad_signature") from None
    except jwt.PyJWTError:
        raise _refuse("bad_claims") from None

    if payload.get("role") != "authenticated":
        raise _refuse("bad_claims")
    try:
        user_id = UUID(str(payload["sub"]))
    except ValueError:
        raise _refuse("bad_claims") from None
    return Player(user_id=user_id, is_anonymous=payload.get("is_anonymous") is True)


async def require_token(request: Request) -> Player:
    """The token is valid. The user may not have a profile yet."""
    return await _verify(request)


async def require_player(request: Request) -> Player:
    """The token is valid and its user has a profile (403 `no_profile` otherwise)."""
    player = await _verify(request)
    async with request.app.state.database.connection() as conn:
        cursor = await conn.execute("select internal.http_profile_exists(%s)", (player.user_id,))
        row = await cursor.fetchone()
    if not row or row[0] is not True:
        raise no_profile()
    return player
