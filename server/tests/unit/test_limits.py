from collections.abc import Iterator

from fastapi.testclient import TestClient
from tests.unit.api_helpers import JwksServer, make_app

LIMIT = 16 * 1024
JSON = {"Content-Type": "application/json"}


def client() -> TestClient:
    return TestClient(make_app(JwksServer()))


def test_a_body_of_exactly_16_kb_is_read() -> None:
    body = b'{"a":"' + b"x" * (LIMIT - 8) + b'"}'
    assert len(body) == LIMIT

    assert client().post("/echo", content=body, headers=JSON).status_code == 200


def test_a_body_one_byte_over_is_refused_by_its_header() -> None:
    body = b'{"a":"' + b"x" * (LIMIT - 7) + b'"}'
    assert len(body) == LIMIT + 1

    response = client().post("/echo", content=body, headers=JSON)

    assert response.status_code == 413
    assert response.json() == {"status": "too_large"}


def test_a_body_one_byte_over_is_refused_when_streamed() -> None:
    def chunks() -> Iterator[bytes]:
        yield b'{"a":"'
        yield b"x" * (LIMIT - 7)
        yield b'"}'

    response = client().post("/echo", content=chunks(), headers=JSON)

    assert response.status_code == 413
    assert response.json() == {"status": "too_large"}


def test_a_streamed_body_far_over_is_refused() -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(10):
            yield b"x" * 4096

    response = client().post("/echo", content=chunks(), headers=JSON)

    assert response.status_code == 413


def test_malformed_json_is_422_invalid() -> None:
    response = client().post("/echo", content=b"{not json", headers=JSON)

    assert response.status_code == 422
    assert response.json() == {"status": "invalid"}
