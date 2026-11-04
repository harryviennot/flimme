from typing import cast

import pytest

from server.db.pool import Database
from server.rooms.finished import make_room_finished_handler
from server.workers.pipeline import ROOM_FINISHED
from server.workers.runner import Delivery, Reject

pytestmark = pytest.mark.anyio


def test_the_room_finished_queue_has_the_documented_values():
    assert ROOM_FINISHED.name == "room_finished"
    assert ROOM_FINISHED.vt_s == 60
    assert ROOM_FINISHED.poison_after == 5
    assert ROOM_FINISHED.concurrency == 2


@pytest.mark.parametrize("body", [{}, {"room_id": "nope"}, {"room_id": None}, {"other": 1}])
async def test_bad_input_is_rejected_before_the_database_is_touched(body: dict[str, object]):
    handler = make_room_finished_handler(cast(Database, None))
    outcome = await handler(Delivery(msg_id=1, read_ct=1, body=body))
    assert isinstance(outcome, Reject)
    assert "room_id" in outcome.reason
