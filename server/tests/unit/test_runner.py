import asyncio
import logging
import os
import signal
from collections.abc import Callable

import pytest
from tests.unit.fakes import FakeQueue, wait_until

from server.workers.runner import (
    Delivery,
    Done,
    Handler,
    Outcome,
    QueueRunner,
    QueueSpec,
    Reject,
    install_signal_handlers,
)

pytestmark = pytest.mark.anyio

SPEC = QueueSpec("catalog_refresh", vt_s=300, poison_after=5, concurrency=4)


def make_runner(
    queue: FakeQueue, handler: Handler, spec: QueueSpec = SPEC, **kwargs: float
) -> QueueRunner:
    return QueueRunner(spec, handler, queue, poll_seconds=1, poll_interval_ms=5, **kwargs)


async def run_until(runner: QueueRunner, done: Callable[[], bool]) -> None:
    stop = asyncio.Event()
    task = asyncio.create_task(runner.run(stop))
    try:
        await wait_until(done)
    finally:
        stop.set()
        await asyncio.wait_for(task, 5)


async def test_a_valid_message_runs_the_handler_once_and_is_deleted():
    queue = FakeQueue()
    queue.send({"kind": "job"})
    calls: list[Delivery] = []

    async def handler(delivery: Delivery) -> Outcome:
        calls.append(delivery)
        return Done()

    await run_until(make_runner(queue, handler), lambda: not queue.messages)
    assert len(calls) == 1
    assert calls[0].read_ct == 1
    assert queue.archived == []


async def test_a_handler_that_raises_leaves_the_message_for_its_timeout():
    queue = FakeQueue()
    msg_id = queue.send({})
    attempts: list[int] = []

    async def handler(delivery: Delivery) -> Outcome:
        attempts.append(delivery.read_ct)
        if delivery.read_ct == 1:
            raise RuntimeError("boom")
        return Done()

    spec = QueueSpec("catalog_refresh", vt_s=1, poison_after=5, concurrency=1)
    await run_until(make_runner(queue, handler, spec), lambda: not queue.messages)
    assert attempts == [1, 2]
    assert msg_id not in queue.messages


async def test_a_message_read_too_often_is_archived_without_running_the_handler(
    caplog: pytest.LogCaptureFixture,
):
    queue = FakeQueue()
    msg_id = queue.send({"secret": "x"})
    queue.messages[msg_id]["read_ct"] = 5  # the next read makes it 6
    called = False

    async def handler(delivery: Delivery) -> Outcome:
        nonlocal called
        called = True
        return Done()

    with caplog.at_level(logging.ERROR):
        await run_until(make_runner(queue, handler), lambda: bool(queue.archived))
    assert queue.archived == [msg_id]
    assert not called
    assert any(r.levelno == logging.ERROR and "poison" in r.getMessage() for r in caplog.records)
    assert "secret" not in caplog.text  # ids only, never the body


async def test_a_message_read_exactly_the_limit_still_runs():
    queue = FakeQueue()
    msg_id = queue.send({})
    queue.messages[msg_id]["read_ct"] = 4  # the next read makes it 5
    calls = 0

    async def handler(delivery: Delivery) -> Outcome:
        nonlocal calls
        calls += 1
        return Done()

    await run_until(make_runner(queue, handler), lambda: not queue.messages)
    assert calls == 1
    assert queue.archived == []


async def test_a_rejected_message_is_archived_at_once():
    queue = FakeQueue()
    msg_id = queue.send({})

    async def handler(delivery: Delivery) -> Outcome:
        return Reject("bad input")

    await run_until(make_runner(queue, handler), lambda: bool(queue.archived))
    assert queue.archived == [msg_id]


async def test_a_long_handler_extends_its_timeout_before_it_runs_out():
    queue = FakeQueue()
    msg_id = queue.send({})
    spec = QueueSpec("catalog_refresh", vt_s=2, poison_after=5, concurrency=1)

    async def handler(delivery: Delivery) -> Outcome:
        await asyncio.sleep(0.3)
        return Done()

    await run_until(
        make_runner(queue, handler, spec, heartbeat_every_s=0.05), lambda: not queue.messages
    )
    assert len(queue.set_vt_calls) >= 2
    assert all(call == (msg_id, 2) for call in queue.set_vt_calls)


async def test_a_short_handler_does_not_extend_anything():
    queue = FakeQueue()
    queue.send({})

    async def handler(delivery: Delivery) -> Outcome:
        return Done()

    await run_until(make_runner(queue, handler), lambda: not queue.messages)
    assert queue.set_vt_calls == []


async def test_shutdown_stops_reading_and_lets_the_running_handler_finish():
    queue = FakeQueue()
    first = queue.send({})
    started = asyncio.Event()
    release = asyncio.Event()
    finished: list[int] = []

    async def handler(delivery: Delivery) -> Outcome:
        started.set()
        await release.wait()
        finished.append(delivery.msg_id)
        return Done()

    spec = QueueSpec("catalog_refresh", vt_s=300, poison_after=5, concurrency=1)
    runner = make_runner(queue, handler, spec)
    stop = asyncio.Event()
    task = asyncio.create_task(runner.run(stop))
    await asyncio.wait_for(started.wait(), 5)

    stop.set()
    second = queue.send({})
    await asyncio.sleep(0.1)
    reads_after_stop = queue.reads
    assert not task.done()  # still waiting for the handler

    release.set()
    await asyncio.wait_for(task, 5)
    assert finished == [first]
    assert first not in queue.messages
    assert second in queue.messages and queue.messages[second]["read_ct"] == 0
    assert queue.reads == reads_after_stop


async def test_a_poll_in_flight_when_the_stop_comes_starts_nothing_and_hands_back():
    queue = FakeQueue()
    first = queue.send({})
    started = asyncio.Event()
    release = asyncio.Event()
    stop = asyncio.Event()
    handled: list[int] = []
    real_read = queue.read
    reads = 0

    async def slow_read(*args: int | str):
        nonlocal reads
        reads += 1
        if reads == 2:  # the poll that is waiting when the stop arrives
            await started.wait()
            stop.set()
            queue.send({})
            return await real_read(*args)  # type: ignore[arg-type]
        return await real_read(*args)  # type: ignore[arg-type]

    queue.read = slow_read  # type: ignore[method-assign,assignment]

    async def handler(delivery: Delivery) -> Outcome:
        handled.append(delivery.msg_id)
        started.set()
        await release.wait()
        return Done()

    task = asyncio.create_task(make_runner(queue, handler).run(stop))
    await asyncio.sleep(0.3)
    release.set()
    await asyncio.wait_for(task, 5)

    assert handled == [first]  # concurrency 4, three free slots, yet nothing new started
    (second,) = [m for m in queue.messages if m != first]
    assert (second, 0) in queue.set_vt_calls  # handed back at once


async def test_a_handler_returning_nothing_is_logged(caplog: pytest.LogCaptureFixture):
    queue = FakeQueue()
    queue.send({})

    async def handler(delivery: Delivery) -> Outcome:
        return None  # type: ignore[return-value]

    with caplog.at_level(logging.ERROR):
        await run_until(
            make_runner(queue, handler, QueueSpec("catalog_refresh", 300, 5, 1)),
            lambda: "neither Done nor Reject" in caplog.text,
        )


async def test_sigterm_asks_the_loop_to_stop():
    stop = asyncio.Event()
    remove = install_signal_handlers(stop)
    try:
        os.kill(os.getpid(), signal.SIGTERM)
        await asyncio.wait_for(stop.wait(), 5)
    finally:
        remove()


async def test_never_more_handlers_than_the_concurrency_limit():
    queue = FakeQueue()
    for _ in range(12):
        queue.send({})
    running = 0
    peak = 0
    handled = 0

    async def handler(delivery: Delivery) -> Outcome:
        nonlocal running, peak, handled
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.03)
        running -= 1
        handled += 1
        return Done()

    await run_until(make_runner(queue, handler), lambda: handled == 12)
    assert peak == 4


async def test_a_failing_read_is_logged_and_retried(caplog: pytest.LogCaptureFixture):
    queue = FakeQueue()
    queue.send({})
    real_read = queue.read
    failures = 0

    async def flaky_read(*args: int | str):
        nonlocal failures
        if failures == 0:
            failures += 1
            raise ConnectionError("database went away")
        return await real_read(*args)  # type: ignore[arg-type]

    queue.read = flaky_read  # type: ignore[method-assign,assignment]

    async def handler(delivery: Delivery) -> Outcome:
        return Done()

    runner = make_runner(queue, handler, retry_wait_s=0.01)
    with caplog.at_level(logging.ERROR):
        await run_until(runner, lambda: not queue.messages)
    assert failures == 1
    assert any("read" in r.getMessage() for r in caplog.records)


async def test_a_handler_over_the_time_cap_is_cancelled_and_left_for_its_timeout(
    caplog: pytest.LogCaptureFixture,
):
    queue = FakeQueue()
    msg_id = queue.send({"secret": "x"})
    cancelled = asyncio.Event()
    calls = 0

    async def slow_handler(delivery: Delivery) -> Outcome:
        nonlocal calls
        calls += 1
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            cancelled.set()
            raise
        return Done()

    spec = QueueSpec("catalog_refresh", vt_s=300, poison_after=5, concurrency=1, max_run_s=0.2)
    runner = make_runner(queue, slow_handler, spec, heartbeat_every_s=0.05)
    caplog.set_level(logging.ERROR)
    stop = asyncio.Event()
    task = asyncio.create_task(runner.run(stop))
    try:
        await wait_until(cancelled.is_set)
        await wait_until(lambda: any("time limit" in r.getMessage() for r in caplog.records))
        calls_at_cancel = len(queue.set_vt_calls)
        await asyncio.sleep(0.2)
    finally:
        stop.set()
        await asyncio.wait_for(task, 5)
    assert calls == 1
    assert msg_id in queue.messages  # not deleted, so its timeout brings it back
    assert queue.archived == []
    assert len(queue.set_vt_calls) == calls_at_cancel  # the timeout is no longer extended
    errors = [r for r in caplog.records if "time limit" in r.getMessage()]
    assert len(errors) == 1
    assert errors[0].levelno == logging.ERROR
    message = errors[0].getMessage()
    assert "catalog_refresh" in message and str(msg_id) in message and "slow_handler" in message
    assert "secret" not in message


async def test_a_handler_under_the_time_cap_is_untouched(caplog: pytest.LogCaptureFixture):
    queue = FakeQueue()
    queue.send({})

    async def handler(delivery: Delivery) -> Outcome:
        await asyncio.sleep(0.05)
        return Done()

    spec = QueueSpec("catalog_refresh", vt_s=300, poison_after=5, concurrency=1, max_run_s=5)
    await run_until(make_runner(queue, handler, spec), lambda: not queue.messages)
    assert not [r for r in caplog.records if "time limit" in r.getMessage()]


async def test_a_handler_that_raises_timeout_itself_is_not_a_time_limit_hit(
    caplog: pytest.LogCaptureFixture,
):
    queue = FakeQueue()
    queue.send({})

    async def handler(delivery: Delivery) -> Outcome:
        if delivery.read_ct == 1:
            raise TimeoutError("its own")
        return Done()

    spec = QueueSpec("catalog_refresh", vt_s=1, poison_after=5, concurrency=1, max_run_s=5)
    await run_until(make_runner(queue, handler, spec), lambda: not queue.messages)
    assert not [r for r in caplog.records if "time limit" in r.getMessage()]


def test_the_default_cap_is_thirty_minutes():
    assert QueueSpec("q", vt_s=1, poison_after=1, concurrency=1).max_run_s == 30 * 60
