import pytest
from pydantic import SecretStr
from tests.contract.conftest import open_database

from server.db.pool import PIPELINE_CONNECTIONS

pytestmark = pytest.mark.anyio


async def test_a_pipeline_connection_has_a_60_second_statement_timeout(pipeline_url: SecretStr):
    db = await open_database(pipeline_url)
    try:
        async with db.connection() as conn:
            row = await (await conn.execute("show statement_timeout")).fetchone()
        assert row == ("1min",)
        reader = await db.connect_reader()
        try:
            row = await (await reader.execute("show statement_timeout")).fetchone()
            assert row == ("1min",)
        finally:
            await reader.close()
    finally:
        await db.close()


async def test_the_pool_sets_the_timeout_itself_not_only_the_role(pipeline_url: SecretStr):
    db = await open_database(pipeline_url, statement_timeout_s=7)
    try:
        async with db.connection() as conn:
            row = await (await conn.execute("show statement_timeout")).fetchone()
        assert row == ("7s",)
    finally:
        await db.close()


async def test_the_worker_uses_four_connections_one_of_them_for_reading(
    pipeline_url: SecretStr,
):
    assert PIPELINE_CONNECTIONS == 4
    db = await open_database(pipeline_url)
    try:
        assert db.pool_size == PIPELINE_CONNECTIONS - 1
    finally:
        await db.close()


async def test_the_login_is_the_pipeline_user_not_a_superuser(pipeline_url: SecretStr):
    db = await open_database(pipeline_url)
    try:
        async with db.connection() as conn:
            row = await (await conn.execute("select current_user")).fetchone()
        assert row == ("flimme_pipeline",)
    finally:
        await db.close()
