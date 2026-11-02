import pytest

from server.catalog.curation import Curation
from server.db.payloads import JobMessage
from server.workers.pipeline import CATALOG_REFRESH, Context, make_dispatcher, make_job_handler
from server.workers.runner import Delivery, Done, Outcome, Reject

pytestmark = pytest.mark.anyio


def delivery(body: dict[str, object]) -> Delivery:
    return Delivery(msg_id=1, read_ct=1, body=body)


def test_the_pipeline_consumes_catalog_refresh_with_the_documented_values():
    assert CATALOG_REFRESH.name == "catalog_refresh"
    assert CATALOG_REFRESH.vt_s == 300
    assert CATALOG_REFRESH.poison_after == 5
    assert CATALOG_REFRESH.concurrency == 4


async def test_a_message_goes_to_the_handler_of_its_kind():
    seen: list[object] = []

    async def job(message: object, _: Delivery) -> Outcome:
        seen.append(message)
        return Done()

    dispatch = make_dispatcher({"job": job})
    outcome = await dispatch(delivery({"kind": "job", "job": "changes_daily"}))
    assert outcome == Done()
    assert seen == [JobMessage(job="changes_daily")]


async def test_a_kind_nobody_handles_yet_is_rejected():
    dispatch = make_dispatcher({})
    outcome = await dispatch(delivery({"kind": "job", "job": "changes_daily"}))
    assert isinstance(outcome, Reject)
    assert "job" in outcome.reason


@pytest.mark.parametrize("body", [{"kind": "nope"}, {}, {"kind": "fetch"}])
async def test_a_body_that_fails_validation_is_rejected(body: dict[str, object]):
    async def never(message: object, _: Delivery) -> Outcome:
        raise AssertionError("the handler must not run")

    dispatch = make_dispatcher({"job": never, "fetch": never, "sweep": never})
    assert isinstance(await dispatch(delivery(body)), Reject)


async def test_a_job_goes_to_its_runner_and_an_unknown_job_is_rejected():
    seen: list[str] = []

    async def reference(_: Context) -> Outcome:
        seen.append("reference_weekly")
        return Done()

    context = Context(database=None, tmdb=None, curation=Curation())  # type: ignore[arg-type]
    dispatch = make_dispatcher({"job": make_job_handler(context, {"reference_weekly": reference})})

    assert await dispatch(delivery({"kind": "job", "job": "reference_weekly"})) == Done()
    assert seen == ["reference_weekly"]
    assert isinstance(await dispatch(delivery({"kind": "job", "job": "changes_daily"})), Reject)
