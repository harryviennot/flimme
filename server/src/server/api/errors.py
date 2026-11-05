"""The API's answers. A status is an answer: `{"status": "..."}` with the HTTP code that fits.

Handlers are registered by `install`; routes raise `ApiError` to answer early.
"""

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(HTTPException):
    """An early answer. It is an HTTPException so FastAPI's body parsing lets it through
    instead of turning it into its own 400."""

    def __init__(self, status_code: int, status: str, headers: dict[str, str] | None = None):
        super().__init__(status_code=status_code, detail=status, headers=headers)
        self.status = status


def unauthorized() -> ApiError:
    return ApiError(401, "unauthorized", {"WWW-Authenticate": "Bearer"})


def no_profile() -> ApiError:
    return ApiError(403, "no_profile")


def too_large() -> ApiError:
    return ApiError(413, "too_large")


def answer(error: ApiError) -> JSONResponse:
    return JSONResponse(
        {"status": error.status}, status_code=error.status_code, headers=error.headers
    )


def install(app: FastAPI) -> None:
    async def api_error(_: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, ApiError)
        return answer(error)

    async def invalid(_: Request, __: Exception) -> JSONResponse:
        # Never echo what was sent: the default answer repeats the body.
        return JSONResponse({"status": "invalid"}, status_code=422)

    handlers: dict[Any, Any] = {ApiError: api_error, RequestValidationError: invalid}
    for exception, handler in handlers.items():
        app.add_exception_handler(exception, handler)
