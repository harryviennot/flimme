from fastapi.testclient import TestClient

from server.api.app import create_app


def test_health_reports_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
