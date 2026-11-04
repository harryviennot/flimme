"""The end of a room (`room_finished`, data-model.md#after-the-match).

Load, compute, write all happen in the database: `internal.write_room_stats` reads the room,
computes its stats and overwrites `rooms.stats`. The same room gives the same numbers, so a
message that arrives twice changes nothing. The handler only calls it.

Logs carry the room id and nothing else.
"""

import logging
from uuid import UUID

from pydantic import ValidationError

from server.db.contract import write_room_stats
from server.db.payloads import RoomFinishedMessage
from server.db.pool import Database
from server.workers.runner import Delivery, Done, Handler, Outcome, Reject

log = logging.getLogger(__name__)


def make_room_finished_handler(database: Database) -> Handler:
    async def handle(delivery: Delivery) -> Outcome:
        try:
            message = RoomFinishedMessage.model_validate(delivery.body)
        except ValidationError as error:
            # Field names and error types only: the input may not be ours to log.
            problems = ", ".join(
                f"{'.'.join(str(p) for p in e['loc']) or 'body'}: {e['type']}"
                for e in error.errors(include_input=False)
            )
            return Reject(f"does not validate ({problems})")
        return await run_room_finished(database, message.room_id)

    return handle


async def run_room_finished(database: Database, room_id: UUID) -> Outcome:
    async with database.connection() as conn:
        stats = await write_room_stats(conn, room_id)
    if stats is None:
        # Gone, or not ended: nothing to write, and a retry would find the same.
        log.info("room_finished: no stats for room %s", room_id)
    return Done()
