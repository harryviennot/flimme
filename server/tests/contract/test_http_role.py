import uuid

import pytest
from psycopg import errors
from pydantic import SecretStr

from server.db.pool import API_CONNECTIONS, API_STATEMENT_TIMEOUT_S, Database

pytestmark = pytest.mark.anyio


async def open_api_database(url: SecretStr) -> Database:
    return await Database.open(
        url,
        role="flimme_http",
        pool_size=API_CONNECTIONS,
        statement_timeout_s=API_STATEMENT_TIMEOUT_S,
    )


async def test_the_api_pool_runs_http_profile_exists_as_flimme_http(pipeline_url: SecretStr):
    db = await open_api_database(pipeline_url)
    try:
        async with db.connection() as conn:
            row = await (await conn.execute("select current_user")).fetchone()
            assert row == ("flimme_http",)
            row = await (
                await conn.execute("select internal.http_profile_exists(%s)", (uuid.uuid4(),))
            ).fetchone()
            assert row == (False,)
            row = await (await conn.execute("show statement_timeout")).fetchone()
            assert row == ("5s",)
        assert db.pool_size == API_CONNECTIONS
    finally:
        await db.close()


async def test_the_api_login_still_reads_no_table(pipeline_url: SecretStr):
    db = await open_api_database(pipeline_url)
    try:
        async with db.connection() as conn:
            with pytest.raises(errors.InsufficientPrivilege):
                await conn.execute("select count(*) from public.profiles")
    finally:
        await db.close()
