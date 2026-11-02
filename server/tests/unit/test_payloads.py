import pytest
from pydantic import ValidationError

from server.db.payloads import (
    CatalogRefreshAdapter,
    FetchMessage,
    JobMessage,
    SweepMessage,
)


def test_a_job_message_parses():
    message = CatalogRefreshAdapter.validate_python({"kind": "job", "job": "reference_weekly"})
    assert message == JobMessage(job="reference_weekly")


def test_every_job_the_schedule_names_is_accepted():
    for job in (
        "reference_weekly",
        "popularity_daily",
        "availability_sweep",
        "changes_daily",
        "details_weekly",
        "details_monthly",
    ):
        assert CatalogRefreshAdapter.validate_python({"kind": "job", "job": job}).kind == "job"


def test_a_fetch_message_parses():
    body = {"kind": "fetch", "run_id": 42, "tmdb_ids": [60000001, 60000002], "reason": "sweep"}
    assert CatalogRefreshAdapter.validate_python(body) == FetchMessage(
        run_id=42, tmdb_ids=[60000001, 60000002], reason="sweep"
    )


def test_a_sweep_message_parses():
    body = {"kind": "sweep", "run_id": 42, "country": "FR", "provider_id": 60000101}
    assert CatalogRefreshAdapter.validate_python(body) == SweepMessage(
        run_id=42, country="FR", provider_id=60000101
    )


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "nope"},
        {},
        {"kind": "job", "job": "embeddings"},
        {"kind": "fetch", "run_id": 1, "tmdb_ids": [], "reason": "sweep"},
        {"kind": "fetch", "run_id": 1, "tmdb_ids": list(range(1, 102)), "reason": "sweep"},
        {"kind": "fetch", "run_id": 1, "tmdb_ids": [1], "reason": "because"},
        {"kind": "fetch", "tmdb_ids": [1], "reason": "sweep"},
        {"kind": "sweep", "run_id": 1, "country": "France", "provider_id": 8},
    ],
)
def test_bad_bodies_fail_validation(body: dict[str, object]):
    with pytest.raises(ValidationError):
        CatalogRefreshAdapter.validate_python(body)
