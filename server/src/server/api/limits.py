"""Request size limit (security.md#the-servers-http-api-and-letterboxd-uploads).

A body over 16 KB is refused with 413 before it is read whole: by its `Content-Length` if it
has one, and by counting the bytes as they stream in (a chunked body, or a header that lies).
Pure ASGI, so nothing is buffered here.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from server.api.errors import ApiError, answer, too_large

MAX_BODY_BYTES = 16 * 1024


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope["headers"]:
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = 0  # unreadable: the streamed count below still applies
                if declared > self.max_bytes:
                    await answer(too_large())(scope, receive, send)
                    return

        received = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise too_large()
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except ApiError as error:
            # Raised from `receive` below a layer that does not handle it (a route reading the
            # body inside a framework that wraps errors). Answer unless a reply already began.
            if started:
                raise
            await answer(error)(scope, receive, send)
