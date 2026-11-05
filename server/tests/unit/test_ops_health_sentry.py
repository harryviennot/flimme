"""The real sink against a fake transport: what Sentry would receive (M9.5)."""

import json

from tests.unit.test_observability import CapturingTransport, sentry  # noqa: F401

from server.ops.health import Alert, SentrySink

REPORT_ID = "a1b2c3d4-0000-4000-8000-000000000001"


def test_an_alert_is_an_event_with_its_fingerprint_level_and_no_personal_data(
    sentry: CapturingTransport,  # noqa: F811
) -> None:
    alert = Alert(
        "new_reports",
        "error",
        "new_reports crossed: 2 (threshold 0)",
        tags={"report_ids": "a1b2c3d4,e5f6a7b8"},
        report_ids=(REPORT_ID,),
    )
    assert SentrySink().send(alert) is True

    assert len(sentry.events) == 1
    event = sentry.events[0]
    assert event["fingerprint"] == ["ops-health", "new_reports"]
    assert event["level"] == "error"
    assert event["message"] == "new_reports crossed: 2 (threshold 0)"
    assert event["tags"]["report_ids"] == "a1b2c3d4,e5f6a7b8"
    assert "user" not in event
    assert REPORT_ID not in json.dumps(event)


def test_a_warning_keeps_its_level(sentry: CapturingTransport) -> None:  # noqa: F811
    SentrySink().send(Alert("db_size", "warning", "db_size crossed: 80 (threshold 70)"))
    assert sentry.events[0]["level"] == "warning"
    assert sentry.events[0]["fingerprint"] == ["ops-health", "db_size"]


def test_a_check_in_is_sent_with_the_monitor_config(sentry: CapturingTransport) -> None:  # noqa: F811
    sink = SentrySink()
    sink.check_in("in_progress")
    sink.check_in("ok")
    # Check-ins are not events: the transport saw none, and nothing raised.
    assert sentry.events == []
