"""One log line per request: method, route template, status and duration.

Never the raw path (it can hold values), the query string, headers or the body. A path that
matched no route is logged as `unmatched`.
"""

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger(__name__)


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = time.monotonic()
        status = 500  # what ends up sent if the app raises before answering

        async def recording_send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, recording_send)
        finally:
            route = scope.get("route")
            log.info(
                "request",
                extra={
                    "method": scope["method"],
                    "route": getattr(route, "path", None) or "unmatched",
                    "status": status,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                },
            )
