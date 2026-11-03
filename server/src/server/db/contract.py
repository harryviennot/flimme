"""One typed wrapper per `internal.*` function the server calls.

Only `internal.enqueue` for now. The others come with the tasks that call them
(server-structure.md#the-database-layer): the deck worker's with M17.4, Letterboxd's with M20.
"""

from collections.abc import Sequence

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from pydantic import BaseModel


async def enqueue(conn: AsyncConnection, queue: str, message: BaseModel) -> None:
    """`internal.enqueue(queue, message)`: the only way the server sends to a queue."""
    await conn.execute(
        "select internal.enqueue(%s, %s)", (queue, Jsonb(message.model_dump(mode="json")))
    )


async def enqueue_many(conn: AsyncConnection, queue: str, messages: Sequence[BaseModel]) -> None:
    """The same call for many messages, pipelined on one connection the caller already holds:
    one round trip for the lot, and no pool checkout per message."""
    if not messages:
        return
    async with conn.pipeline(), conn.cursor() as cur:
        await cur.executemany(
            "select internal.enqueue(%s, %s)",
            [(queue, Jsonb(m.model_dump(mode="json"))) for m in messages],
        )
