"""The health check (M9.5, operations.md#monitoring-and-alerts).

Every 5 minutes the pipeline worker reads `internal.ops_health()`, which says which thresholds
are crossed (they live in SQL), and sends one Sentry event per crossed signal. Sentry groups the
repeats by fingerprint. Each loop ends with a Sentry cron check-in, so a stopped worker shows
as a missed check-in.

Load, compute, write: `decide` is the pure middle (health JSON in, alerts out); `check_once`
does the I/O. Events carry counts and the SQL's numbers only: never a name, a room code or a
report reason. Report ids are sent as the first 8 characters, since the scrubber redacts whole
UUIDs and a report id is a lookup key, not personal data (`id::text like 'a1b2c3d4%'`).
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Literal, Protocol
from uuid import UUID

import sentry_sdk
from psycopg import AsyncConnection
from sentry_sdk.crons import capture_checkin

from server.db.contract import mark_reports_alerted, ops_health
from server.db.payloads import HealthSignal, OpsHealth
from server.db.pool import Database

log = logging.getLogger(__name__)

INTERVAL_S = 300
FIRST_RUN_DELAY_S = 30
HEALTH_TIMEOUT_S = 10
MONITOR_SLUG = "ops-health"

Level = Literal["warning", "error"]
CheckIn = Literal["in_progress", "ok", "error"]

# Latency and size warn; everything else is an error.
_WARNING = frozenset({"deal_latency_p95", "db_size"})
_NEW_REPORTS = "new_reports"
_FAILED = "ops_health_failed"

MONITOR_CONFIG = {
    "schedule": {"type": "interval", "value": 5, "unit": "minute"},
    "checkin_margin": 5,
    "max_runtime": 2,
    "timezone": "UTC",
}


@dataclass(frozen=True)
class Alert:
    signal: str
    level: Level
    message: str
    tags: dict[str, str] = field(default_factory=dict)
    report_ids: tuple[str, ...] = ()  # set on the new_reports alert, for mark_reports_alerted

    @property
    def fingerprint(self) -> list[str]:
        return ["ops-health", self.signal]


class Sink(Protocol):
    """Where alerts go. Both calls block, so `check_once` runs them in a thread."""

    def send(self, alert: Alert) -> bool:
        """True once Sentry has the event (an id came back and the flush succeeded)."""
        ...

    def check_in(self, status: CheckIn) -> None: ...


def _number(value: float) -> str:
    return f"{value:g}"


def _alert(signal: HealthSignal) -> Alert:
    level: Level = "warning" if signal.name in _WARNING else "error"
    value = "none" if signal.value is None else _number(signal.value)
    if signal.name == _NEW_REPORTS:
        ids = signal.ids or []
        return Alert(
            signal.name,
            level,
            f"{signal.name} crossed: {value} (threshold {_number(signal.threshold)})",
            tags={"report_ids": ",".join(str(i)[:8] for i in ids)},
            report_ids=tuple(str(i) for i in ids),
        )
    return Alert(
        signal.name,
        level,
        f"{signal.name} crossed: {value} (threshold {_number(signal.threshold)})",
    )


def decide(health: OpsHealth) -> list[Alert]:
    """One alert per crossed signal, in the order SQL gave them."""
    return [_alert(s) for s in health.signals if s.crossed]


async def check_once(conn: AsyncConnection, sink: Sink) -> bool:
    """One loop: check in, read, send, mark reports, check out. True when all went well."""
    await asyncio.to_thread(sink.check_in, "in_progress")
    try:
        async with asyncio.timeout(HEALTH_TIMEOUT_S):
            health = await ops_health(conn)
    except Exception as error:
        # The type only: the text of a database error can echo values.
        log.error("ops_health failed: %s", type(error).__name__)
        failure = Alert(_FAILED, "error", f"{_FAILED}: {type(error).__name__}")
        await asyncio.to_thread(sink.send, failure)
        await asyncio.to_thread(sink.check_in, "error")
        return False

    ok = True
    for alert in decide(health):
        sent = await asyncio.to_thread(sink.send, alert)
        if not sent:
            ok = False  # nothing is marked, so the next loop sends it again
            continue
        if alert.report_ids:
            try:
                await mark_reports_alerted(conn, [UUID(i) for i in alert.report_ids])
            except Exception as error:
                log.error("mark_reports_alerted failed: %s", type(error).__name__)
                ok = False
    await asyncio.to_thread(sink.check_in, "ok" if ok else "error")
    return ok


class SentrySink:
    """The real sink. Events keep the fingerprint and level; `before_send` (observability.py)
    scrubs them like any other."""

    def __init__(self) -> None:
        self._check_in_id: str | None = None

    def send(self, alert: Alert) -> bool:
        with sentry_sdk.new_scope() as scope:
            scope.fingerprint = alert.fingerprint
            scope.set_level(alert.level)
            scope.set_tag("signal", alert.signal)
            for key, value in alert.tags.items():
                scope.set_tag(key, value)
            event_id = sentry_sdk.capture_message(alert.message, level=alert.level)
        return bool(event_id) and sentry_sdk.flush(timeout=HEALTH_TIMEOUT_S) is not False

    def check_in(self, status: CheckIn) -> None:
        # Retries of a failed loop start a fresh check-in: only "in_progress" opens one.
        check_in_id = None if status == "in_progress" else self._check_in_id
        result = capture_checkin(
            monitor_slug=MONITOR_SLUG,
            check_in_id=check_in_id,
            status=status,
            monitor_config=MONITOR_CONFIG,  # type: ignore[arg-type]
        )
        if status == "in_progress":
            self._check_in_id = result


async def run_health_loop(
    database: Database,
    sink: Sink,
    stop: asyncio.Event,
    *,
    interval_s: float = INTERVAL_S,
    first_delay_s: float = FIRST_RUN_DELAY_S,
) -> None:
    """Run `check_once` every `interval_s`, the first time after `first_delay_s`, until `stop`."""
    delay = first_delay_s
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
            return
        except TimeoutError:
            pass
        delay = interval_s
        try:
            async with database.connection() as conn:
                await check_once(conn, sink)
        except Exception as error:  # a lost connection must not end the loop
            log.error("health check could not run: %s", type(error).__name__)
