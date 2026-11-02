"""The queue loop, the same for every queue (server-structure.md#consuming-the-queues).

1. Read with `read_with_poll`: it waits for messages without busy-looping.
2. A message read more often than the queue allows is poisoned: archived, logged as an
   error, handler not run. Never retried forever.
3. Otherwise the handler runs, and while it runs the loop extends the message's timeout
   (`set_vt`) before it runs out, but only up to `max_run_s` (30 minutes by default). Past
   that the handler is cancelled and the message is left for its timeout, like a failure.
4. `Done` deletes the message. `Reject` (bad input, will never succeed) archives it at once.
   An exception is a failure worth retrying: nothing is done, the timeout brings it back.
5. On shutdown (`stop` is set) the loop stops reading, lets the handlers in progress finish
   and returns. Messages already read are still handled, since they are hidden anyway.

Logs carry ids and counts only, never a message body.
"""

import asyncio
import contextlib
import logging
import signal
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from server.db.queues import QueueMessage

log = logging.getLogger(__name__)

# A handler runs at most this long (decisions.md, 2 Nov 2026). Set per queue with `max_run_s`.
DEFAULT_MAX_RUN_S = 30 * 60


@dataclass(frozen=True)
class QueueSpec:
    name: str
    vt_s: int  # visibility timeout
    poison_after: int  # a message read more than this many times is poisoned
    concurrency: int  # handlers running at once
    max_run_s: float = DEFAULT_MAX_RUN_S  # a handler running longer is cancelled and retried


@dataclass(frozen=True)
class Delivery:
    """What a handler gets: the message's identity and its raw JSON body."""

    msg_id: int
    read_ct: int
    body: dict[str, Any]


@dataclass(frozen=True)
class Done:
    """The work is finished: delete the message."""


@dataclass(frozen=True)
class Reject:
    """The message will never succeed (bad input): archive it now. The reason is logged."""

    reason: str


Outcome = Done | Reject
Handler = Callable[[Delivery], Awaitable[Outcome]]


class QueueClient(Protocol):
    async def read(
        self, queue: str, vt: int, qty: int, max_poll_seconds: int, poll_interval_ms: int
    ) -> list[QueueMessage]: ...
    async def delete(self, queue: str, msg_id: int) -> bool: ...
    async def archive(self, queue: str, msg_id: int) -> bool: ...
    async def set_vt(self, queue: str, msg_id: int, vt: int) -> bool: ...


class QueueRunner:
    def __init__(
        self,
        spec: QueueSpec,
        handler: Handler,
        client: QueueClient,
        *,
        poll_seconds: int = 5,
        poll_interval_ms: int = 100,
        heartbeat_every_s: float | None = None,
        retry_wait_s: float = 2.0,
    ) -> None:
        self._spec = spec
        self._handler = handler
        self._client = client
        self._poll_seconds = poll_seconds
        self._poll_interval_ms = poll_interval_ms
        # Well before the timeout runs out: a late heartbeat is a redelivery.
        self._heartbeat_every_s = heartbeat_every_s or spec.vt_s / 3
        self._retry_wait_s = retry_wait_s

    async def run(self, stop: asyncio.Event) -> None:
        spec = self._spec
        running: set[asyncio.Task[None]] = set()
        stop_wait = asyncio.create_task(stop.wait())
        log.info("queue %s: consuming (concurrency %d)", spec.name, spec.concurrency)
        try:
            while not stop.is_set():
                free = spec.concurrency - len(running)
                if free == 0:
                    # Every slot is busy: wait for one to free up, or for shutdown.
                    await asyncio.wait([*running, stop_wait], return_when=asyncio.FIRST_COMPLETED)
                    continue
                try:
                    messages = await self._client.read(
                        spec.name, spec.vt_s, free, self._poll_seconds, self._poll_interval_ms
                    )
                except Exception:
                    log.exception("queue %s: read failed, trying again", spec.name)
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(stop.wait(), self._retry_wait_s)
                    continue
                if stop.is_set():
                    # The stop arrived while the poll was waiting. Start nothing new: hand the
                    # messages back at once so another worker (or the next start) takes them.
                    for message in messages:
                        await self._acknowledge(self._release, message.msg_id)
                    continue
                for message in messages:
                    task = asyncio.create_task(self._process(message))
                    running.add(task)
                    task.add_done_callback(running.discard)
        finally:
            stop_wait.cancel()
            if running:
                log.info("queue %s: stopping, waiting for %d handler(s)", spec.name, len(running))
                await asyncio.gather(*running, return_exceptions=True)
            log.info("queue %s: stopped", spec.name)

    async def _process(self, message: QueueMessage) -> None:
        spec = self._spec
        if message.read_ct > spec.poison_after:
            log.error(
                "queue %s: message %d is poison (read %d times), archived without running",
                spec.name,
                message.msg_id,
                message.read_ct,
            )
            await self._acknowledge(self._client.archive, message.msg_id)
            return

        delivery = Delivery(message.msg_id, message.read_ct, message.body)
        heartbeat = asyncio.create_task(self._heartbeat(message.msg_id))
        limit = asyncio.timeout(spec.max_run_s)
        try:
            async with limit:
                outcome = await self._handler(delivery)
        except TimeoutError as error:
            if not limit.expired():
                self._log_failure(message, error)
                return
            # Hung or too slow: the heartbeat stops (below), the timeout brings it back.
            log.error(
                "queue %s: message %d hit the time limit of %s s in handler %s on read %d, "
                "cancelled and left for its timeout",
                spec.name,
                message.msg_id,
                spec.max_run_s,
                getattr(self._handler, "__qualname__", type(self._handler).__name__),
                message.read_ct,
            )
            return
        except Exception as error:
            # Worth retrying: leave the message, its timeout brings it back.
            self._log_failure(message, error)
            return
        finally:
            heartbeat.cancel()

        match outcome:
            case Done():
                await self._acknowledge(self._client.delete, message.msg_id)
            case Reject(reason):
                log.warning(
                    "queue %s: message %d rejected (%s), archived",
                    spec.name,
                    message.msg_id,
                    reason,
                )
                await self._acknowledge(self._client.archive, message.msg_id)
            case _:
                log.error(
                    "queue %s: message %d: the handler returned neither Done nor Reject",
                    spec.name,
                    message.msg_id,
                )

    def _log_failure(self, message: QueueMessage, error: Exception) -> None:
        log.error(
            "queue %s: message %d failed on read %d (%s), left for its timeout",
            self._spec.name,
            message.msg_id,
            message.read_ct,
            type(error).__name__,
            exc_info=True,
        )

    async def _release(self, queue: str, msg_id: int) -> bool:
        log.info("queue %s: stopping, message %d handed back unstarted", queue, msg_id)
        return await self._client.set_vt(queue, msg_id, 0)

    async def _heartbeat(self, msg_id: int) -> None:
        """Keep the message hidden while its handler runs."""
        while True:
            await asyncio.sleep(self._heartbeat_every_s)
            try:
                if not await self._client.set_vt(self._spec.name, msg_id, self._spec.vt_s):
                    return  # the message is gone; nothing left to extend
            except Exception:
                log.exception("queue %s: extending message %d failed", self._spec.name, msg_id)

    async def _acknowledge(
        self, action: Callable[[str, int], Awaitable[bool]], msg_id: int
    ) -> None:
        try:
            await action(self._spec.name, msg_id)
        except Exception:
            # The message comes back after its timeout; every handler is safe to run twice.
            log.exception("queue %s: acknowledging message %d failed", self._spec.name, msg_id)


def install_signal_handlers(stop: asyncio.Event) -> Callable[[], None]:
    """SIGTERM and SIGINT set `stop`. Returns a function that puts the old handlers back."""
    loop = asyncio.get_running_loop()
    signals = (signal.SIGTERM, signal.SIGINT)
    for sig in signals:
        loop.add_signal_handler(sig, stop.set)

    def remove() -> None:
        for sig in signals:
            loop.remove_signal_handler(sig)

    return remove
