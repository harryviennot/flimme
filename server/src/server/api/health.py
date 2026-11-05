"""`GET /healthz`: the process and its database connection, no token."""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

HEALTH_TIMEOUT_S = 2

router = APIRouter()


async def _select_one(request: Request) -> None:
    async with request.app.state.database.connection() as conn:
        cursor = await conn.execute("select 1")
        await cursor.fetchone()


@router.get("/healthz")
async def healthz(request: Request) -> JSONResponse:
    try:
        await asyncio.wait_for(_select_one(request), HEALTH_TIMEOUT_S)
    except Exception as error:
        logger.warning("health check: database unavailable (%s)", type(error).__name__)
        return JSONResponse({"status": "db_unavailable"}, status_code=503)
    body: dict[str, Any] = {"status": "ok"}
    return JSONResponse(body)
