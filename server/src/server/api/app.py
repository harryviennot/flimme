"""The FastAPI application (server-structure.md#the-http-api).

`create_app` takes the settings, and optionally the key cache and the database (tests pass
fakes; in production the lifespan builds them). Every route but `/healthz` depends on
`require_token` or `require_player` (`server.api.auth`). Request bodies are capped at 16 KB.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from server.api import errors, health
from server.api.auth import JwksCache
from server.api.limits import BodyLimitMiddleware
from server.config import Environment, Process, Settings
from server.db.pool import API_CONNECTIONS, API_STATEMENT_TIMEOUT_S, Database


def create_app(
    settings: Settings,
    *,
    jwks: JwksCache | None = None,
    database: Database | None = None,
) -> FastAPI:
    if settings.supabase_url is None:
        raise ValueError("SUPABASE_URL is not set")
    base = settings.supabase_url.rstrip("/")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client: httpx.AsyncClient | None = None
        opened: Database | None = None
        if jwks is None:
            client = httpx.AsyncClient()
            app.state.jwks = JwksCache(f"{base}/auth/v1/.well-known/jwks.json", client)
        if database is None:
            opened = await Database.open(
                settings.database_url_for(Process.API),
                pool_size=API_CONNECTIONS,
                statement_timeout_s=API_STATEMENT_TIMEOUT_S,
            )
            app.state.database = opened
        try:
            yield
        finally:
            if opened is not None:
                await opened.close()
            if client is not None:
                await client.aclose()

    # The interactive docs only exist locally; no CORS, only phones call the API.
    local = settings.environment is Environment.LOCAL
    app = FastAPI(
        title="Flimme server",
        lifespan=lifespan,
        docs_url="/docs" if local else None,
        redoc_url="/redoc" if local else None,
        openapi_url="/openapi.json" if local else None,
    )
    app.state.issuer = f"{base}/auth/v1"
    app.state.jwks = jwks
    app.state.database = database
    errors.install(app)
    app.add_middleware(BodyLimitMiddleware)
    app.include_router(health.router)
    return app
