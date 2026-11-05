"""Logs and crash reports without personal data (security.md#logging-without-personal-data).

`setup(settings, process_name)` is the first thing every command does after loading its
settings. It does two things:

1. Logs: one JSON object per line on stdout. Only allow-listed fields get through (`ALLOWED`),
   every string passes the scrubber, and an exception logs its type, its SQLSTATE when it has
   one and the stack, never its arguments or locals (a psycopg error can echo a value).
2. Sentry, when `SENTRY_DSN` is set: no user, no request data, no headers, no ids, no local
   variables, no tracing. `ERROR` log lines become events, `INFO` lines become breadcrumbs.

The scrubber redacts bearer tokens, JWT-shaped strings, Supabase keys, PostHog keys and emails.
It is a net under the rule "do not log it", not the rule itself.
"""

import json
import logging
import os
import re
import sys
import traceback
from datetime import UTC, datetime
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.transport import Transport

from server.config import Settings

log = logging.getLogger(__name__)

# The fields a log call may attach with `extra=`. Anything else is dropped.
ALLOWED = frozenset(
    {
        "room_id",
        "member_id",
        "profile_id",
        "queue",
        "msg_id",
        "job",
        "status",
        "duration_ms",
        "error_kind",
        "count",
        # Added by the access log and by database errors.
        "method",
        "route",
        "sqlstate",
    }
)
# Ids that Sentry never gets, even though the logs carry them.
IDS = ("room_id", "member_id", "profile_id")

REDACTED = "[redacted]"
_PATTERNS = (
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+"),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"),
    re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+"),
    re.compile(r"\bph[a-z]_[A-Za-z0-9]{8,}"),
    re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
)

# The attributes every LogRecord has; the rest came from `extra=`.
_STANDARD = frozenset(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "taskName"}


def scrub(text: str) -> str:
    for pattern in _PATTERNS:
        text = pattern.sub(REDACTED, text)
    return text


def _clean(value: Any) -> Any:
    return scrub(value) if isinstance(value, str) else value


def _allowed_extras(record: logging.LogRecord) -> dict[str, Any]:
    return {
        key: _clean(value)
        for key, value in record.__dict__.items()
        if key not in _STANDARD and key in ALLOWED
    }


def _stack(error: BaseException) -> str:
    frames = traceback.extract_tb(error.__traceback__)
    return "\n".join(f"{frame.filename}:{frame.lineno} in {frame.name}" for frame in frames)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": scrub(record.getMessage()),
        }
        line.update(_allowed_extras(record))
        if record.exc_info and record.exc_info[1] is not None:
            error = record.exc_info[1]
            line.setdefault("error_kind", type(error).__name__)
            sqlstate = getattr(error, "sqlstate", None)
            if isinstance(sqlstate, str):
                line.setdefault("sqlstate", sqlstate)
            line["stack"] = scrub(_stack(error))
        return json.dumps(line, default=str, ensure_ascii=False)


def configure_logging() -> None:
    """INFO for our own loggers, as JSON. `httpx` and `httpcore` log every request at INFO,
    which on the first full load is about 120,000 lines (and a line is a URL), so they speak at
    WARNING. uvicorn's own access log is off: the API writes its own (`api/access.py`)."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").disabled = True


# --- Sentry -------------------------------------------------------------------------------


def before_send(event: Any, hint: Any) -> Any:
    event.pop("user", None)
    event.pop("request", None)  # data, cookies, headers, query string and the URL
    event.pop("server_name", None)
    extra = event.get("extra")
    if isinstance(extra, dict):
        event["extra"] = {k: _clean(v) for k, v in extra.items() if k in ALLOWED and k not in IDS}
    tags = event.get("tags")
    if isinstance(tags, dict):
        event["tags"] = {k: v for k, v in tags.items() if k not in IDS}
    # An exception's text can carry what was sent (pydantic and psycopg echo values), so only
    # its type and stack are kept.
    for exception in event.get("exception", {}).get("values", []):
        exception["value"] = ""
    logentry = event.get("logentry")
    if isinstance(logentry, dict):
        logentry["message"] = scrub(str(logentry.get("formatted") or logentry.get("message", "")))
        logentry.pop("formatted", None)
        logentry.pop("params", None)
    if isinstance(event.get("message"), str):
        event["message"] = scrub(event["message"])
    event["breadcrumbs"] = {
        "values": [_breadcrumb(b) for b in event.get("breadcrumbs", {}).get("values", [])]
    }
    return event


def _breadcrumb(crumb: dict[str, Any]) -> dict[str, Any]:
    kept = {key: crumb[key] for key in ("level", "category", "timestamp", "type") if key in crumb}
    if "message" in crumb:
        kept["message"] = scrub(str(crumb["message"]))
    return kept


def before_breadcrumb(crumb: Any, hint: Any) -> Any:
    if crumb.get("category") in ("httplib", "http"):
        return None  # URLs carry values
    return _breadcrumb(crumb)


def release() -> str | None:
    """`sha-<commit>`: from GIT_SHA, or from the image Fly runs (`...:sha-<commit>`)."""
    sha = os.environ.get("GIT_SHA")
    if sha:
        return f"sha-{sha}"
    tag = os.environ.get("FLY_IMAGE_REF", "").rsplit(":", 1)[-1]
    return tag if tag.startswith("sha-") else None


def init_sentry(settings: Settings, process_name: str, transport: Transport | None = None) -> bool:
    """Start Sentry. False (and nothing sent) without a DSN."""
    if settings.sentry_dsn is None:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.environment.value,
        release=release(),
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=0,
        before_send=before_send,
        before_breadcrumb=before_breadcrumb,
        integrations=[LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)],
        transport=transport,
    )
    sentry_sdk.set_tag("process", process_name)
    return True


def setup(settings: Settings, process_name: str, *, transport: Transport | None = None) -> bool:
    """Logs as JSON, and Sentry when `SENTRY_DSN` is set. Returns whether Sentry is on."""
    configure_logging()
    enabled = init_sentry(settings, process_name, transport)
    if not enabled:
        log.info("sentry is off: SENTRY_DSN is not set")
    return enabled


def sentry_check() -> list[str]:
    """Send one message and one exception, wait for them, and return their event ids."""
    ids: list[str] = []
    message_id = sentry_sdk.capture_message("flimme server sentry-check", level="info")
    if message_id:
        ids.append(message_id)
    try:
        raise RuntimeError("flimme server sentry-check")
    except RuntimeError as error:
        error_id = sentry_sdk.capture_exception(error)
        if error_id:
            ids.append(error_id)
    sentry_sdk.flush(timeout=10)
    return ids
