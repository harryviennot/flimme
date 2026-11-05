"""The health check decides from the SQL's JSON, then sends (M9.5). No Sentry, no database."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import pytest
from psycopg import AsyncConnection

from server.db.payloads import OpsHealth
from server.ops import health
from server.ops.health import Alert, CheckIn, check_once, decide

pytestmark = pytest.mark.anyio

REPORT = "a1b2c3d4-0000-4000-8000-000000000001"
CONN: Any = None


def make_health(*crossed: str, report: bool = False) -> OpsHealth:
    signals: list[dict[str, Any]] = [
        {"name": "db_size", "value": 10, "threshold": 70, "crossed": False}
    ]
    for name in crossed:
        signals.append({"name": name, "value": 99, "threshold": 5, "crossed": True})
    if report:
        signals.append(
            {"name": "new_reports", "value": 1, "threshold": 0, "crossed": True, "ids": [REPORT]}
        )
    return OpsHealth.model_validate({"checked_at": "2026-11-05T10:00:00Z", "signals": signals})


class FakeSink:
    def __init__(self, accept: bool = True) -> None:
        self.accept = accept
        self.alerts: list[Alert] = []
        self.check_ins: list[CheckIn] = []

    def send(self, alert: Alert) -> bool:
        self.alerts.append(alert)
        return self.accept

    def check_in(self, status: CheckIn) -> None:
        self.check_ins.append(status)


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    state: dict[str, Any] = {"health": make_health(), "marked": [], "raises": None}

    async def fake_health(conn: AsyncConnection) -> OpsHealth:
        if state["raises"] is not None:
            raise state["raises"]
        result: OpsHealth = state["health"]
        return result

    async def fake_mark(conn: AsyncConnection, ids: list[UUID]) -> int:
        state["marked"].append(ids)
        return len(ids)

    monkeypatch.setattr(health, "ops_health", fake_health)
    monkeypatch.setattr(health, "mark_reports_alerted", fake_mark)
    return state


async def test_two_crossed_signals_are_two_events_with_their_fingerprints_and_levels(
    calls: dict[str, Any],
) -> None:
    calls["health"] = make_health("deal_latency_p95", "sweep_guard")
    sink = FakeSink()
    await check_once(CONN, sink)
    assert [a.fingerprint for a in sink.alerts] == [
        ["ops-health", "deal_latency_p95"],
        ["ops-health", "sweep_guard"],
    ]
    assert [a.level for a in sink.alerts] == ["warning", "error"]
    assert sink.alerts[1].message == "sweep_guard crossed: 99 (threshold 5)"


async def test_nothing_crossed_sends_no_event_and_checks_in_ok(calls: dict[str, Any]) -> None:
    sink = FakeSink()
    await check_once(CONN, sink)
    assert sink.alerts == []
    assert sink.check_ins == ["in_progress", "ok"]


async def test_a_report_is_marked_only_after_the_event_is_accepted(calls: dict[str, Any]) -> None:
    calls["health"] = make_health(report=True)
    refusing = FakeSink(accept=False)
    assert await check_once(CONN, refusing) is False
    assert calls["marked"] == []
    assert refusing.check_ins[-1] == "error"

    accepting = FakeSink()
    await check_once(CONN, accepting)
    assert calls["marked"] == [[UUID(REPORT)]]
    assert accepting.check_ins[-1] == "ok"


async def test_the_report_event_has_a_count_and_short_ids_and_nothing_personal(
    calls: dict[str, Any],
) -> None:
    calls["health"] = make_health(report=True)
    sink = FakeSink()
    await check_once(CONN, sink)
    alert = sink.alerts[0]
    assert alert.message == "new_reports crossed: 1 (threshold 0)"
    assert alert.tags == {"report_ids": "a1b2c3d4"}
    text = json.dumps([alert.message, alert.tags, alert.fingerprint])
    assert REPORT not in text


async def test_ops_health_raising_is_one_error_event_and_an_error_check_in(
    calls: dict[str, Any],
) -> None:
    calls["raises"] = RuntimeError("password=hunter2 for room ABC123")
    sink = FakeSink()
    assert await check_once(CONN, sink) is False
    assert len(sink.alerts) == 1
    assert sink.alerts[0].level == "error"
    assert sink.alerts[0].message == "ops_health_failed: RuntimeError"
    assert sink.check_ins == ["in_progress", "error"]


async def test_ops_health_timing_out_is_the_same(
    calls: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def slow(conn: AsyncConnection) -> OpsHealth:
        await asyncio.sleep(5)
        return make_health()

    monkeypatch.setattr(health, "ops_health", slow)
    monkeypatch.setattr(health, "HEALTH_TIMEOUT_S", 0.05)
    sink = FakeSink()
    assert await check_once(CONN, sink) is False
    assert sink.alerts[0].message == "ops_health_failed: TimeoutError"
    assert sink.check_ins[-1] == "error"


def test_a_null_value_stays_readable() -> None:
    parsed = OpsHealth.model_validate(
        {
            "checked_at": "x",
            "signals": [{"name": "sweep_guard", "value": None, "threshold": 0, "crossed": True}],
        }
    )
    assert decide(parsed)[0].message == "sweep_guard crossed: none (threshold 0)"


class FakeDatabase:
    @asynccontextmanager
    async def connection(self) -> AsyncIterator[None]:
        yield None


async def test_the_loop_checks_after_its_first_delay_and_stops_on_the_event(
    calls: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    runs: list[int] = []

    async def fake_check(conn: AsyncConnection, sink: Any) -> bool:
        runs.append(1)
        return True

    monkeypatch.setattr(health, "check_once", fake_check)
    stop = asyncio.Event()
    task = asyncio.create_task(
        health.run_health_loop(
            FakeDatabase(),  # type: ignore[arg-type]
            FakeSink(),
            stop,
            interval_s=0.02,
            first_delay_s=0.02,
        )
    )
    await asyncio.sleep(0.15)
    stop.set()
    await asyncio.wait_for(task, 1)
    assert len(runs) >= 2
