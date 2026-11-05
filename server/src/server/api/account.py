"""`POST /v1/account/delete`: forget the player who calls
(security.md#account-deletion-and-data-export).

The token's `sub` is the only thing deleted; the request names nobody (a body is never read).
Order: the analytics person first, then the auth user, whose deletion cascades in the database
(profile, services, consents, links, history; past seats stay anonymous). Each step has a 5
second timeout and one retry. If either fails the answer is `503 {"status": "try_again"}`; a
retry finishes the job, because "already gone" counts as done at both steps.

Nothing secret is logged: no token, no key, no response body. A line names the profile id, the
outcome and the duration.
"""

import logging
import time
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from server.api.auth import Player, require_token
from server.api.errors import ApiError
from server.config import Settings

logger = logging.getLogger(__name__)

STEP_TIMEOUT_S = 5
ATTEMPTS = 2

router = APIRouter()


class StepFailed(Exception):
    """An outside call did not finish. Carries the step's name only, never a response."""

    def __init__(self, step: str) -> None:
        super().__init__(step)
        self.step = step


def _try_again() -> ApiError:
    return ApiError(503, "try_again")


async def _forget_in_posthog(http: httpx.AsyncClient, settings: Settings, user_id: UUID) -> None:
    """Delete the person whose distinct id is the profile id, with their events. No person, or
    a person already gone, is done."""
    assert settings.posthog_personal_api_key is not None
    project = f"{settings.posthog_host.rstrip('/')}/api/projects/{settings.posthog_project_id}"
    headers = {"Authorization": f"Bearer {settings.posthog_personal_api_key.get_secret_value()}"}

    found = await http.get(
        f"{project}/persons/",
        params={"distinct_id": str(user_id)},
        headers=headers,
        timeout=STEP_TIMEOUT_S,
    )
    found.raise_for_status()
    results: list[Any] = found.json().get("results", [])
    for person in results:
        deleted = await http.delete(
            f"{project}/persons/{person.get('uuid') or person['id']}/",
            params={"delete_events": "true"},
            headers=headers,
            timeout=STEP_TIMEOUT_S,
        )
        if deleted.status_code != 404:
            deleted.raise_for_status()


async def _delete_auth_user(http: httpx.AsyncClient, settings: Settings, user_id: UUID) -> None:
    """Supabase's auth admin API. A secret key (`sb_secret_...`) goes in the `apikey` header; it
    is not a JWT, so it is not sent as a bearer token. 404 means the user is already gone."""
    assert settings.supabase_url is not None and settings.supabase_secret_key is not None
    deleted = await http.delete(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
        headers={"apikey": settings.supabase_secret_key.get_secret_value()},
        timeout=STEP_TIMEOUT_S,
    )
    if deleted.status_code != 404:
        deleted.raise_for_status()


async def _with_one_retry(step: str, user_id: UUID, call: Any) -> None:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            await call()
            return
        except Exception as error:
            logger.warning(
                "account deletion %s: %s failed on attempt %d (%s)",
                user_id,
                step,
                attempt,
                type(error).__name__,
            )
    raise StepFailed(step)


@router.post("/v1/account/delete")
async def delete_account(
    request: Request,
    player: Player = Depends(require_token),  # noqa: B008
) -> JSONResponse:
    started = time.monotonic()
    http: httpx.AsyncClient = request.app.state.http
    settings: Settings = request.app.state.settings
    user_id = player.user_id

    try:
        if settings.posthog_personal_api_key is None:
            logger.info("account deletion %s: no PostHog key, analytics step skipped", user_id)
        else:
            await _with_one_retry(
                "posthog", user_id, lambda: _forget_in_posthog(http, settings, user_id)
            )
        await _with_one_retry(
            "auth_admin", user_id, lambda: _delete_auth_user(http, settings, user_id)
        )
    except StepFailed as failed:
        logger.warning(
            "account deletion %s: try_again after %s failed (%.2fs)",
            user_id,
            failed.step,
            time.monotonic() - started,
        )
        raise _try_again() from None

    logger.info("account deletion %s: ok (%.2fs)", user_id, time.monotonic() - started)
    return JSONResponse({"status": "ok"})
