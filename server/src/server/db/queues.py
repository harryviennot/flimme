"""pgmq, called directly with SQL (server-structure.md#consuming-the-queues).

The functions take a connection. `PgmqClient` is what the runner uses: it reads on the
reader connection (reopened after a failure) and acknowledges on the pool. Sending is not
here: the server sends through `internal.enqueue` (`db/contract.py`).
"""

import logging
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg import AsyncConnection

from server.db.pool import Database

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class QueueMessage:
    msg_id: int
    read_ct: int  # how many times it has been read, this read included
    body: dict[str, Any]


async def read_with_poll(
    conn: AsyncConnection,
    queue: str,
    vt: int,
    qty: int,
    max_poll_seconds: int,
    poll_interval_ms: int,
) -> list[QueueMessage]:
    """Wait up to `max_poll_seconds` for messages, hide them for `vt` seconds, return them."""
    cur = await conn.execute(
        "select msg_id, read_ct, message from pgmq.read_with_poll(%s, %s, %s, %s, %s)",
        (queue, vt, qty, max_poll_seconds, poll_interval_ms),
    )
    return [QueueMessage(msg_id, read_ct, body) for msg_id, read_ct, body in await cur.fetchall()]


async def delete(conn: AsyncConnection, queue: str, msg_id: int) -> bool:
    cur = await conn.execute("select pgmq.delete(%s, %s::bigint)", (queue, msg_id))
    row = await cur.fetchone()
    return bool(row and row[0])


async def archive(conn: AsyncConnection, queue: str, msg_id: int) -> bool:
    cur = await conn.execute("select pgmq.archive(%s, %s::bigint)", (queue, msg_id))
    row = await cur.fetchone()
    return bool(row and row[0])


async def set_vt(conn: AsyncConnection, queue: str, msg_id: int, vt: int) -> bool:
    """Hide the message for `vt` more seconds. False if it no longer exists."""
    cur = await conn.execute(
        "select msg_id from pgmq.set_vt(%s, %s::bigint, %s)", (queue, msg_id, vt)
    )
    return await cur.fetchone() is not None


class PgmqClient:
    def __init__(self, database: Database) -> None:
        self._database = database
        self._reader: AsyncConnection | None = None

    async def read(
        self, queue: str, vt: int, qty: int, max_poll_seconds: int, poll_interval_ms: int
    ) -> list[QueueMessage]:
        if self._reader is None or self._reader.closed:
            self._reader = await self._database.connect_reader()
        try:
            return await read_with_poll(
                self._reader, queue, vt, qty, max_poll_seconds, poll_interval_ms
            )
        except psycopg.Error:
            # Drop the connection; the next read opens a fresh one.
            await self.close()
            raise

    async def delete(self, queue: str, msg_id: int) -> bool:
        async with self._database.connection() as conn:
            return await delete(conn, queue, msg_id)

    async def archive(self, queue: str, msg_id: int) -> bool:
        async with self._database.connection() as conn:
            return await archive(conn, queue, msg_id)

    async def set_vt(self, queue: str, msg_id: int, vt: int) -> bool:
        async with self._database.connection() as conn:
            return await set_vt(conn, queue, msg_id, vt)

    async def close(self) -> None:
        reader, self._reader = self._reader, None
        if reader is not None and not reader.closed:
            try:
                await reader.close()
            except psycopg.Error:
                log.warning("closing the reader connection failed")
