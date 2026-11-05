import time

from fastapi.testclient import TestClient
from tests.unit.api_helpers import FakeDatabase, JwksServer, make_app


def test_health_reports_ok_without_a_token() -> None:
    response = TestClient(make_app(JwksServer())).get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_reports_db_unavailable_when_the_pool_fails() -> None:
    database = FakeDatabase()
    database.down = True

    response = TestClient(make_app(JwksServer(), database)).get("/healthz")

    assert response.status_code == 503
    assert response.json() == {"status": "db_unavailable"}


def test_health_gives_up_on_a_hanging_database_after_about_2_seconds() -> None:
    database = FakeDatabase()
    database.hang = True
    started = time.monotonic()

    response = TestClient(make_app(JwksServer(), database)).get("/healthz")

    assert response.status_code == 503
    assert response.json() == {"status": "db_unavailable"}
    assert 1.5 < time.monotonic() - started < 4
