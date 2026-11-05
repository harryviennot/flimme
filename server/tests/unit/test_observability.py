"""Logs and Sentry events carry no personal data (M9.4).

Every secret below is made up on the spot. The DSN is a placeholder that points nowhere: the
fake transport below receives the events, nothing leaves the process.
"""

import asyncio
import io
import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
import sentry_sdk
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sentry_sdk.transport import Transport
from tests.unit.api_helpers import SUPABASE_URL, FakeDatabase, JwksServer, make_app
from tests.unit.fakes import FakeQueue, wait_until

from server import observability
from server.api.auth import Player, require_player
from server.cli import main
from server.config import Environment, Settings
from server.workers.runner import Delivery, Done, QueueRunner, QueueSpec

BEARER = "Bearer eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl"
SECRET_KEY = "sb_secret_Zk3Jq9fakefakefake"
PUBLISHABLE_KEY = "sb_publishable_Qa7fakefakefake"
POSTHOG_KEY = "phx_fakefakefakefake1234"
EMAIL = "marie.dupont@example.com"
NAME = "Marie Dupont"
SECRETS = (BEARER, "eyJhbGciOiJFUzI1NiJ9", SECRET_KEY, PUBLISHABLE_KEY, POSTHOG_KEY, EMAIL)
FAKE_DSN = "https://publickey@o0.ingest.de.sentry.io/0"


class CapturingTransport(Transport):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[dict[str, Any]] = []

    def capture_envelope(self, envelope: Any) -> None:
        event = envelope.get_event()
        if event is not None:
            self.events.append(event)


def settings(dsn: str | None = FAKE_DSN) -> Settings:
    return Settings(  # pyright: ignore[reportCallIssue]
        environment=Environment.LOCAL,
        supabase_url=SUPABASE_URL,
        sentry_dsn=SecretStr(dsn) if dsn else None,
    )


@pytest.fixture
def lines() -> Iterator[io.StringIO]:
    """The JSON formatter on a buffer, attached to the root logger."""
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setFormatter(observability.JsonFormatter())
    root = logging.getLogger()
    before, level = root.handlers[:], root.level
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    yield buffer
    root.handlers[:] = before
    root.setLevel(level)


@pytest.fixture
def sentry() -> Iterator[CapturingTransport]:
    transport = CapturingTransport()
    assert observability.init_sentry(settings(), "test", transport)
    yield transport
    sentry_sdk.flush()
    sentry_sdk.get_client().close()
    sentry_sdk.get_global_scope().set_client(None)  # pyright: ignore[reportArgumentType]
    sentry_sdk.get_isolation_scope().clear()
    sentry_sdk.get_current_scope().clear()


def logged(buffer: io.StringIO) -> list[dict[str, Any]]:
    return [json.loads(line) for line in buffer.getvalue().splitlines()]


def test_a_log_line_is_json_with_only_the_allowed_fields(lines: io.StringIO) -> None:
    logging.getLogger("t").info(
        "deck dealt",
        extra={
            "room_id": "r1",
            "profile_id": "p1",
            "duration_ms": 12,
            "count": 3,
            "display_name": NAME,
            "email": EMAIL,
            "body": {"a": 1},
        },
    )

    [line] = logged(lines)
    assert set(line) == {
        "time",
        "level",
        "logger",
        "message",
        "room_id",
        "profile_id",
        "duration_ms",
        "count",
    }
    assert line["level"] == "INFO"
    assert line["logger"] == "t"
    assert line["time"].endswith("+00:00")
    assert NAME not in lines.getvalue()
    assert EMAIL not in lines.getvalue()


def test_secrets_in_a_message_or_an_extra_are_redacted(lines: io.StringIO) -> None:
    log = logging.getLogger("t")
    log.warning("sent Authorization: %s", BEARER)
    log.warning(f"keys {SECRET_KEY} {PUBLISHABLE_KEY} {POSTHOG_KEY} for {EMAIL}")
    log.warning("with extra", extra={"status": f"{BEARER} {EMAIL}"})
    log.warning("token eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln alone")

    text = lines.getvalue()
    for secret in SECRETS:
        assert secret not in text
    assert text.count(observability.REDACTED) >= 6


def test_an_exception_logs_its_type_and_stack_not_its_arguments(lines: io.StringIO) -> None:
    class Boom(Exception):
        sqlstate = "23505"

    def fail() -> None:
        raise Boom(f"duplicate key value ({NAME}, {EMAIL})")

    try:
        fail()
    except Boom:
        logging.getLogger("t").exception("write failed")

    [line] = logged(lines)
    assert line["error_kind"] == "Boom"
    assert line["sqlstate"] == "23505"
    assert "in fail" in line["stack"]
    assert NAME not in lines.getvalue()
    assert EMAIL not in lines.getvalue()


def test_a_psycopg_error_logs_its_sqlstate_and_not_the_parameter(lines: io.StringIO) -> None:
    import psycopg.errors

    try:
        raise psycopg.errors.UniqueViolation(f"duplicate key: Key (name)=({NAME}) already exists")
    except psycopg.errors.UniqueViolation:
        logging.getLogger("db").exception("insert failed")

    [line] = logged(lines)
    assert line["sqlstate"] == "23505"
    assert line["error_kind"] == "UniqueViolation"
    assert NAME not in lines.getvalue()


def test_an_error_log_is_one_event_and_an_info_log_only_a_breadcrumb(
    sentry: CapturingTransport, lines: io.StringIO
) -> None:
    log = logging.getLogger("t")
    log.info("fetched things", extra={"room_id": "r1", "profile_id": "p1", "count": 4})
    assert sentry.events == []

    log.error(
        "it broke for %s",
        EMAIL,
        extra={"room_id": "r1", "member_id": "m1", "profile_id": "p1", "queue": "q", "count": 4},
    )

    [event] = sentry.events
    assert event["extra"] == {"queue": "q", "count": 4}
    assert EMAIL not in json.dumps(event)
    crumbs = event["breadcrumbs"]["values"]
    assert [c["message"] for c in crumbs] == ["fetched things"]
    assert set(crumbs[0]) <= {"level", "category", "timestamp", "type", "message"}
    for field in ("room_id", "member_id", "profile_id"):
        assert field not in json.dumps(event)


def test_an_event_has_the_environment_and_the_process_but_no_user(
    sentry: CapturingTransport,
) -> None:
    sentry_sdk.set_user({"id": "should-not-stay"})
    logging.getLogger("t").error("x")

    [event] = sentry.events
    assert event["environment"] == "local"
    assert event["tags"]["process"] == "test"
    assert "should-not-stay" not in json.dumps(event)


def test_an_exception_in_a_route_leaves_no_body_header_cookie_query_user_or_id(
    sentry: CapturingTransport,
) -> None:
    server = JwksServer()
    app: FastAPI = make_app(server)

    @app.post("/boom")
    async def boom(
        body: dict[str, Any],
        player: Player = Depends(require_player),  # noqa: B008
    ) -> None:
        sentry_sdk.set_tag("profile_id", str(player.user_id))
        raise RuntimeError(f"failed for {body['name']} {EMAIL} {BEARER}")

    from tests.unit.api_helpers import SigningKey, claims

    key = SigningKey("k1")
    server.keys.append(key)
    profile = claims()["sub"]
    from uuid import UUID

    app.state.database = FakeDatabase({UUID(profile)})
    token = key.sign(claims())

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/boom?email=" + EMAIL,
        json={"name": NAME, "film": "Alien"},
        headers={"Authorization": f"Bearer {token}", "Cookie": "session=abc123"},
    )

    assert response.status_code == 500
    [event] = sentry.events
    text = json.dumps(event)
    for value in (NAME, EMAIL, token, "abc123", "Alien", profile):
        assert value not in text
    for key_name in ("request", "user"):
        assert key_name not in event
    assert event["exception"]["values"][0]["type"] == "RuntimeError"
    assert event["exception"]["values"][0]["value"] == ""
    assert "profile_id" not in event.get("tags", {})
    for frame in event["exception"]["values"][0]["stacktrace"]["frames"]:
        assert "vars" not in frame


@pytest.mark.anyio
async def test_a_poison_message_is_one_event_with_the_queue_and_id_and_no_payload(
    sentry: CapturingTransport,
) -> None:
    queue = FakeQueue()
    msg_id = queue.send({"email": EMAIL, "display_name": NAME})
    queue.messages[msg_id]["read_ct"] = 9  # already read more than the queue allows
    spec = QueueSpec("catalog_refresh", vt_s=300, poison_after=5, concurrency=1)

    async def handler(delivery: Delivery) -> Done:
        raise AssertionError("a poisoned message never runs")

    runner = QueueRunner(spec, handler, queue, poll_seconds=1, poll_interval_ms=5)
    stop = asyncio.Event()
    task = asyncio.create_task(runner.run(stop))
    try:
        await wait_until(lambda: msg_id in queue.archived)
    finally:
        stop.set()
        await asyncio.wait_for(task, 5)

    [event] = sentry.events
    assert event["extra"] == {"queue": "catalog_refresh", "msg_id": msg_id}
    assert NAME not in json.dumps(event)
    assert EMAIL not in json.dumps(event)


def test_without_a_dsn_setup_logs_one_line_and_sends_nothing(
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = logging.getLogger()
    before, level = root.handlers[:], root.level
    try:
        assert observability.setup(settings(dsn=None), "test") is False
        sentry_sdk.capture_message("nobody listens")
    finally:
        root.handlers[:] = before
        root.setLevel(level)

    out = capsys.readouterr().out.splitlines()
    assert len(out) == 1
    assert json.loads(out[0])["message"] == "sentry is off: SENTRY_DSN is not set"
    assert not sentry_sdk.get_client().is_active()


def test_sentry_check_exits_1_without_a_dsn(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    root = logging.getLogger()
    before, level = root.handlers[:], root.level
    try:
        assert main(["sentry-check"]) == 1
    finally:
        root.handlers[:] = before
        root.setLevel(level)

    assert "SENTRY_DSN is not set" in capsys.readouterr().err


def test_sentry_check_sends_a_message_and_an_exception(sentry: CapturingTransport) -> None:
    ids = observability.sentry_check()

    assert len(ids) == 2
    assert len(sentry.events) == 2


def test_the_release_comes_from_the_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FLY_IMAGE_REF", raising=False)
    monkeypatch.delenv("GIT_SHA", raising=False)
    assert observability.release() is None
    monkeypatch.setenv("FLY_IMAGE_REF", "registry.fly.io/app:sha-abc123")
    assert observability.release() == "sha-abc123"
    monkeypatch.setenv("GIT_SHA", "def456")
    assert observability.release() == "sha-def456"


def test_a_request_writes_one_access_line_with_the_route_template(lines: io.StringIO) -> None:
    app = make_app(JwksServer())
    client = TestClient(app)

    client.get("/healthz?token=" + SECRET_KEY, headers={"Authorization": BEARER})

    [line] = [entry for entry in logged(lines) if entry["logger"] == "server.api.access"]
    assert line["method"] == "GET"
    assert line["route"] == "/healthz"
    assert line["status"] == 200
    assert isinstance(line["duration_ms"], int)
    text = lines.getvalue()
    assert SECRET_KEY not in text
    assert "eyJ" not in text


def test_an_unknown_path_is_logged_as_unmatched_never_as_the_raw_path(
    lines: io.StringIO,
) -> None:
    client = TestClient(make_app(JwksServer()))

    client.get(f"/v1/rooms/{EMAIL}")

    [line] = [entry for entry in logged(lines) if entry["logger"] == "server.api.access"]
    assert line["route"] == "unmatched"
    assert line["status"] == 404
    assert EMAIL not in lines.getvalue()


def test_an_id_in_an_earlier_message_does_not_reach_sentry(sentry: CapturingTransport) -> None:
    profile = "11111111-1111-4111-8111-111111111111"
    log = logging.getLogger("t")
    log.info("account deletion %s: ok", profile)
    log.error("later failure for room %s", profile)

    [event] = sentry.events
    assert profile not in json.dumps(event)


def test_the_api_leaves_logging_to_us_so_uvicorn_prints_no_ip_path_or_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import uvicorn

    from server import cli

    calls: dict[str, Any] = {}
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:5432/db")
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setattr(uvicorn, "run", lambda app, **kwargs: calls.update(kwargs))
    root = logging.getLogger()
    before, level = root.handlers[:], root.level
    try:
        assert cli.main(["api"]) == 0
    finally:
        root.handlers[:] = before
        root.setLevel(level)

    assert calls["log_config"] is None
    assert calls["access_log"] is False
