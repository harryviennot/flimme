"""Contract tests: the real schema, the real pgmq, the real `flimme_pipeline` rights.

Locally they run against `supabase start` (port 54322) or the lite database; CI runs them on
the stack (the `server-contract` job). CONTRACT_ADMIN_DATABASE_URL points at a superuser
connection to that database. Migrations never give the server logins a password, and the local
stack is shared by every worktree on a Mac, so the tests set none: they connect as the
superuser and `set role flimme_pipeline` on every connection (`open_database`), which gives the
rights, grants and row-level security of the real login. A killed run leaves nothing behind.
"""

import os
from collections.abc import AsyncIterator

import psycopg
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr

from server.db.pool import Database

ADMIN_URL = os.environ.get(
    "CONTRACT_ADMIN_DATABASE_URL", "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"
)


async def open_database(url: SecretStr, **kwargs: int) -> Database:
    return await Database.open(url, role="flimme_pipeline", **kwargs)


@pytest.fixture(scope="session")
def pipeline_url() -> SecretStr:
    try:
        with psycopg.connect(ADMIN_URL, connect_timeout=3):
            pass
    except psycopg.OperationalError as error:
        reason = f"no database for the contract tests at CONTRACT_ADMIN_DATABASE_URL: {error}"
        if os.environ.get("REQUIRE_DATABASE"):
            pytest.fail(reason)  # CI must never pass by running nothing
        pytest.skip(reason)
    return SecretStr(ADMIN_URL)


@pytest.fixture
async def admin(pipeline_url: SecretStr) -> AsyncIterator[AsyncConnection]:
    """A superuser connection to look at the queue from outside, on an emptied queue."""
    async with await AsyncConnection.connect(ADMIN_URL, autocommit=True) as conn:
        await conn.execute("truncate pgmq.q_catalog_refresh, pgmq.a_catalog_refresh")
        yield conn
        await conn.execute("truncate pgmq.q_catalog_refresh, pgmq.a_catalog_refresh")
