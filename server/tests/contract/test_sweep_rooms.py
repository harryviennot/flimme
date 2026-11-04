"""The room sweeper against two real connections (M6.6): skipping a locked room, and the procedure.

pgTAP runs in one transaction, so it can neither hold a lock from a second session nor run a
procedure that commits. Here the superuser makes rooms outside any transaction, one connection
holds a room's lock, and `internal.sweep_room` / `call internal.sweep_rooms()` run on another.
"""

import random
import uuid
from collections.abc import AsyncIterator

import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.contract.conftest import ADMIN_URL

pytestmark = pytest.mark.anyio


@pytest.fixture
async def lobby(pipeline_url: SecretStr) -> AsyncIterator[tuple[AsyncConnection, uuid.UUID]]:
    """A lobby that expired a minute ago, made by the superuser and removed afterwards."""
    async with await AsyncConnection.connect(ADMIN_URL, autocommit=True) as conn:
        await conn.execute(
            "insert into public.countries (code) values ('FR') on conflict do nothing"
        )
        code = f"{random.randint(100000, 999999)}"
        cur = await conn.execute(
            "insert into public.rooms (code, mode, state, country, expires_at)"
            " select %s, gm.slug, 'lobby', 'FR', now() - interval '1 minute'"
            " from public.game_modes gm limit 1 returning id",
            (code,),
        )
        row = await cur.fetchone()
        assert row is not None, "no game_modes row: the seed is missing"
        room_id: uuid.UUID = row[0]
        try:
            yield conn, room_id
        finally:
            await conn.execute("delete from public.rooms where id = %s", (room_id,))


async def sweep_room(conn: AsyncConnection, room_id: uuid.UUID) -> str:
    cur = await conn.execute("select internal.sweep_room(%s)", (room_id,))
    row = await cur.fetchone()
    assert row is not None
    return str(row[0])


async def state_of(conn: AsyncConnection, room_id: uuid.UUID) -> str:
    cur = await conn.execute("select state::text from public.rooms where id = %s", (room_id,))
    row = await cur.fetchone()
    assert row is not None
    return str(row[0])


async def test_a_room_another_transaction_holds_is_skipped_then_handled(
    lobby: tuple[AsyncConnection, uuid.UUID],
) -> None:
    conn, room_id = lobby
    async with await AsyncConnection.connect(ADMIN_URL) as holder:
        # A vote in flight: it holds the room lock until it commits.
        await holder.execute(
            "select 1 from public.rooms where id = %s for no key update", (room_id,)
        )
        assert await sweep_room(conn, room_id) == "locked"
        assert await state_of(conn, room_id) == "lobby"
        await holder.rollback()
    assert await sweep_room(conn, room_id) == "abandoned"
    assert await state_of(conn, room_id) == "abandoned"


async def test_the_procedure_sweeps_every_live_room_and_commits(
    lobby: tuple[AsyncConnection, uuid.UUID],
) -> None:
    conn, room_id = lobby
    # Sweeps every live room of the database it points at, so only ever run it on a test stack.
    await conn.execute("call internal.sweep_rooms()")
    assert await state_of(conn, room_id) == "abandoned"
