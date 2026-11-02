"""Connections for one process: an async pool plus one connection kept for reading.

The pipeline worker gets 4 connections (server-structure.md#the-database-layer): one is kept
for `pgmq.read_with_poll`, which holds its connection while it waits, and the other 3 are the
pool the acknowledgements and the handlers share. Every connection sets its own statement
timeout; the role carries the same number as a floor.
"""

from contextlib import AbstractAsyncContextManager

from psycopg import AsyncConnection, sql
from psycopg_pool import AsyncConnectionPool
from pydantic import SecretStr

PIPELINE_CONNECTIONS = 4
PIPELINE_STATEMENT_TIMEOUT_S = 60


class Database:
    def __init__(
        self,
        url: SecretStr,
        pool: AsyncConnectionPool[AsyncConnection],
        statement_timeout_s: int,
        role: str | None = None,
    ) -> None:
        self._url = url
        self._role = role
        self._pool = pool
        self._statement_timeout_s = statement_timeout_s

    @classmethod
    async def open(
        cls,
        url: SecretStr,
        *,
        connections: int = PIPELINE_CONNECTIONS,
        statement_timeout_s: int = PIPELINE_STATEMENT_TIMEOUT_S,
        role: str | None = None,
    ) -> "Database":
        """Open the pool (one connection short of `connections`) and check the database is there.

        `role` is for the contract tests only: they log in as a superuser and `set role` to the
        server login, so no password is ever set on a shared local database.
        """

        async def configure(conn: AsyncConnection) -> None:
            await _set_role(conn, role)
            await _set_statement_timeout(conn, statement_timeout_s)

        pool = AsyncConnectionPool[AsyncConnection](
            url.get_secret_value(),
            min_size=1,
            max_size=connections - 1,
            kwargs={"autocommit": True},
            configure=configure,
            check=AsyncConnectionPool.check_connection,
            open=False,
        )
        await pool.open(wait=True, timeout=15)
        return cls(url, pool, statement_timeout_s, role)

    @property
    def pool_size(self) -> int:
        return self._pool.max_size

    def connection(self) -> AbstractAsyncContextManager[AsyncConnection]:
        """A connection from the pool, returned when the block ends."""
        return self._pool.connection()

    async def connect_reader(self) -> AsyncConnection:
        """The connection kept for `read_with_poll`; the caller closes it."""
        conn = await AsyncConnection.connect(
            self._url.get_secret_value(), autocommit=True, connect_timeout=15
        )
        try:
            await _set_role(conn, self._role)
            await _set_statement_timeout(conn, self._statement_timeout_s)
        except BaseException:
            await conn.close()
            raise
        return conn

    async def close(self) -> None:
        await self._pool.close()


async def _set_role(conn: AsyncConnection, role: str | None) -> None:
    if role is not None:
        await conn.execute(sql.SQL("set role {}").format(sql.Identifier(role)))


async def _set_statement_timeout(conn: AsyncConnection, seconds: int) -> None:
    # `set` takes no bind parameter, so the number goes in as a literal.
    await conn.execute(sql.SQL("set statement_timeout = {}").format(sql.Literal(seconds * 1000)))
