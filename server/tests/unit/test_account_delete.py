"""POST /v1/account/delete (M8.5): PostHog first, then Supabase's auth admin API, both
mocked. Every key, project id and user id here is made up."""

import logging
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from tests.unit.api_helpers import (
    SUPABASE_URL,
    FakeDatabase,
    JwksServer,
    SigningKey,
    claims,
)

from server.api.app import create_app
from server.cli import main
from server.config import Environment, Settings

USER = UUID("11111111-1111-4111-8111-111111111111")
OTHER = UUID("22222222-2222-4222-8222-222222222222")
SECRET_KEY = "sb_secret_made_up_for_tests"
POSTHOG_KEY = "phx_made_up_for_tests"
PROJECT = "424242"
POSTHOG_HOST = "https://posthog.test"
PERSON = "99999999-9999-4999-8999-999999999999"
PERSON_BODY = "body-that-must-not-be-logged"
ADMIN_URL = f"{SUPABASE_URL}/auth/v1/admin/users/{USER}"


class Outside:
    """The two outside services. Each plan lists the status codes to answer, call by call (the
    last repeats); -1 means the connection times out."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, httpx.Request]] = []
        self.person_found = True
        self.lookup: list[int] = [200]
        self.delete_person: list[int] = [204]
        self.admin: list[int] = [200]

    def _answer(self, name: str, url: str, request: httpx.Request, plan: list[int]) -> int:
        self.calls.append((name, url, request))
        count = sum(1 for call in self.calls if call[0] == name)
        code = plan[min(count - 1, len(plan) - 1)]
        if code < 0:
            raise httpx.ConnectTimeout("timeout")
        return code

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.startswith(POSTHOG_HOST):
            if request.method == "GET":
                code = self._answer("posthog_lookup", url, request, self.lookup)
                results = [{"id": 7, "uuid": PERSON}] if self.person_found else []
                return httpx.Response(code, json={"results": results, "note": PERSON_BODY})
            code = self._answer("posthog_delete", url, request, self.delete_person)
            return httpx.Response(code)
        assert request.method == "DELETE"
        code = self._answer("admin", url, request, self.admin)
        return httpx.Response(code, json={"message": PERSON_BODY})

    def names(self) -> list[str]:
        return [call[0] for call in self.calls]


@pytest.fixture
def key() -> SigningKey:
    return SigningKey("key-1")


@pytest.fixture
def outside() -> Outside:
    return Outside()


def client_for(
    key: SigningKey,
    outside: Outside,
    *,
    environment: Environment = Environment.STAGING,
    posthog: bool = True,
) -> TestClient:
    settings = Settings(  # pyright: ignore[reportCallIssue]
        environment=environment,
        supabase_url=SUPABASE_URL,
        supabase_secret_key=SecretStr(SECRET_KEY),
        posthog_personal_api_key=SecretStr(POSTHOG_KEY) if posthog else None,
        posthog_project_id=PROJECT if posthog else None,
        posthog_host=POSTHOG_HOST,
    )
    app = create_app(
        settings,
        jwks=JwksServer(key).cache(),
        database=FakeDatabase(),  # pyright: ignore[reportArgumentType]
        http=httpx.AsyncClient(transport=httpx.MockTransport(outside.handler)),
    )
    return TestClient(app)


def token(key: SigningKey, **overrides: object) -> dict[str, str]:
    return {"Authorization": f"Bearer {key.sign(claims(**overrides))}"}


def test_a_valid_token_asks_posthog_then_the_admin_api_in_that_order(
    key: SigningKey, outside: Outside
) -> None:
    response = client_for(key, outside).post("/v1/account/delete", headers=token(key))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert outside.names() == ["posthog_lookup", "posthog_delete", "admin"]
    lookup, delete, admin = (call[2] for call in outside.calls)
    assert lookup.url.params["distinct_id"] == str(USER)
    assert delete.url.path == f"/api/projects/{PROJECT}/persons/{PERSON}/"
    assert delete.url.params["delete_events"] == "true"
    assert delete.headers["authorization"] == f"Bearer {POSTHOG_KEY}"
    assert admin.url.path == f"/auth/v1/admin/users/{USER}"
    assert admin.headers["apikey"] == SECRET_KEY


def test_posthog_failing_twice_answers_try_again_and_never_calls_the_admin_api(
    key: SigningKey, outside: Outside
) -> None:
    outside.lookup = [-1]

    response = client_for(key, outside).post("/v1/account/delete", headers=token(key))

    assert response.status_code == 503
    assert response.json() == {"status": "try_again"}
    assert outside.names() == ["posthog_lookup", "posthog_lookup"]


def test_posthog_failing_once_is_retried(key: SigningKey, outside: Outside) -> None:
    outside.delete_person = [500, 204]

    response = client_for(key, outside).post("/v1/account/delete", headers=token(key))

    assert response.status_code == 200
    assert outside.names().count("posthog_delete") == 2


def test_admin_api_failing_twice_answers_try_again_and_a_retry_finishes_it(
    key: SigningKey, outside: Outside
) -> None:
    outside.admin = [500, 500, 200]
    client = client_for(key, outside)

    first = client.post("/v1/account/delete", headers=token(key))
    assert first.status_code == 503
    assert first.json() == {"status": "try_again"}

    outside.person_found = False  # PostHog already forgot them: not found is fine
    second = client.post("/v1/account/delete", headers=token(key))
    assert second.status_code == 200
    assert second.json() == {"status": "ok"}


def test_the_admin_api_answering_404_counts_as_done(key: SigningKey, outside: Outside) -> None:
    outside.admin = [404]

    response = client_for(key, outside).post("/v1/account/delete", headers=token(key))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert outside.names().count("admin") == 1


def test_without_a_posthog_key_only_the_admin_call_happens(
    key: SigningKey, outside: Outside
) -> None:
    response = client_for(key, outside, posthog=False).post(
        "/v1/account/delete", headers=token(key)
    )

    assert response.status_code == 200
    assert outside.names() == ["admin"]


@pytest.mark.parametrize(
    "missing", ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "SUPABASE_SECRET_KEY"]
)
def test_production_refuses_to_start_without_a_key(
    missing: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
    capsys: pytest.CaptureFixture[str],
) -> None:
    values = {
        "ENVIRONMENT": "production",
        "API_DATABASE_URL": "postgresql://api:pw-made-up@127.0.0.1:5432/postgres",
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_SECRET_KEY": SECRET_KEY,
        "POSTHOG_PERSONAL_API_KEY": POSTHOG_KEY,
        "POSTHOG_PROJECT_ID": PROJECT,
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv(missing)
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["api"]) == 1

    message = capsys.readouterr().err
    assert f"{missing} is not set" in message
    for value in (SECRET_KEY, POSTHOG_KEY, "pw-made-up"):
        assert value not in message


def test_a_bad_token_answers_401_and_calls_nothing(key: SigningKey, outside: Outside) -> None:
    client = client_for(key, outside)

    none = client.post("/v1/account/delete")
    expired = client.post("/v1/account/delete", headers=token(key, exp=1000, iat=900))
    forged_headers = {"Authorization": f"Bearer {SigningKey('key-1').sign(claims())}"}
    forged = client.post("/v1/account/delete", headers=forged_headers)

    for response in (none, expired, forged):
        assert response.status_code == 401
        assert response.json() == {"status": "unauthorized"}
    assert outside.calls == []


def test_a_body_naming_another_user_still_deletes_only_the_token_subject(
    key: SigningKey, outside: Outside
) -> None:
    response = client_for(key, outside).post(
        "/v1/account/delete",
        headers=token(key),
        json={"user_id": str(OTHER), "sub": str(OTHER), "id": str(OTHER)},
    )

    assert response.status_code == 200
    assert all(str(OTHER) not in call[1] for call in outside.calls)
    assert outside.calls[-1][1] == ADMIN_URL


def test_malformed_json_is_ignored_and_the_token_is_still_checked(
    key: SigningKey, outside: Outside
) -> None:
    client = client_for(key, outside)

    bad = client.post("/v1/account/delete", content=b"{not json", headers=token(key))
    assert bad.status_code == 200
    unauthenticated = client.post("/v1/account/delete", content=b"{not json")
    assert unauthenticated.status_code == 401


def test_a_token_without_a_profile_can_still_delete(key: SigningKey, outside: Outside) -> None:
    # FakeDatabase() knows no profile: require_token must not look for one.
    response = client_for(key, outside).post("/v1/account/delete", headers=token(key))

    assert response.status_code == 200


def test_the_logs_hold_the_outcome_and_no_token_key_or_response_body(
    key: SigningKey, outside: Outside, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    headers = token(key)
    outside.admin = [500]
    client = client_for(key, outside)

    client.post("/v1/account/delete", headers=headers)  # fails: try again
    outside.admin = [200]
    client.post("/v1/account/delete", headers=headers)

    text = "\n".join(record.getMessage() for record in caplog.records)
    assert str(USER) in text
    assert "try_again" in text and "ok" in text
    bearer = headers["Authorization"].split(" ")[1]
    for secret in (bearer, SECRET_KEY, POSTHOG_KEY, PERSON_BODY):
        assert secret not in text
