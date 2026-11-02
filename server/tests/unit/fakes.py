"""An in-memory queue with pgmq's visibility rules, for the runner's unit tests."""

import asyncio
import time
from collections.abc import Callable
from typing import Any

from server.db.queues import QueueMessage


class FakeQueue:
    def __init__(self) -> None:
        self.messages: dict[int, dict[str, Any]] = {}
        self.archived: list[int] = []
        self.reads = 0
        self.set_vt_calls: list[tuple[int, int]] = []
        self._next_id = 1

    def send(self, body: dict[str, Any]) -> int:
        msg_id = self._next_id
        self._next_id += 1
        self.messages[msg_id] = {"body": body, "read_ct": 0, "visible_at": 0.0}
        return msg_id

    async def read(
        self, queue: str, vt: int, qty: int, max_poll_seconds: int, poll_interval_ms: int
    ) -> list[QueueMessage]:
        self.reads += 1
        now = time.monotonic()
        out: list[QueueMessage] = []
        for msg_id, row in sorted(self.messages.items()):
            if len(out) == qty:
                break
            if row["visible_at"] <= now:
                row["visible_at"] = now + vt
                row["read_ct"] += 1
                out.append(QueueMessage(msg_id, row["read_ct"], row["body"]))
        if not out:
            await asyncio.sleep(poll_interval_ms / 1000)
        return out

    async def delete(self, queue: str, msg_id: int) -> bool:
        return self.messages.pop(msg_id, None) is not None

    async def archive(self, queue: str, msg_id: int) -> bool:
        if self.messages.pop(msg_id, None) is None:
            return False
        self.archived.append(msg_id)
        return True

    async def set_vt(self, queue: str, msg_id: int, vt: int) -> bool:
        self.set_vt_calls.append((msg_id, vt))
        row = self.messages.get(msg_id)
        if row is None:
            return False
        row["visible_at"] = time.monotonic() + vt
        return True


async def wait_until(predicate: Callable[[], bool], timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("condition not met in time")
