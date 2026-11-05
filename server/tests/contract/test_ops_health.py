"""The health check against the real schema, as flimme_pipeline (M9.5). Sentry is faked."""

import uuid
from collections.abc import AsyncIterator

import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr
from tests.contract.conftest import ADMIN_URL, open_database

from server.db.contract import enqueue, ops_health
from server.db.payloads import RoomFinishedMessage
from server.db.pool import Database
from server.ops.health import Alert, CheckIn, check_once

pytestmark = pytest.mark.anyio


class FakeSink:
    def __init__(self) -> None:
        self.alerts: list[Alert] = []
        self.check_ins: list[CheckIn] = []

    def send(self, alert: Alert) -> bool:
        self.alerts.append(alert)
        return True

    def check_in(self, status: CheckIn) -> None:
        self.check_ins.append(status)


@pytest.fixture
async def database(pipeline_url: SecretStr) -> AsyncIterator[Database]:
    db = await open_database(pipeline_url)
    try:
        yield db
    finally:
        await db.close()


@pytest.fixture
async def admin_report(pipeline_url: SecretStr) -> AsyncIterator[tuple[AsyncConnection, uuid.UUID]]:
    """A room with two seats and one unalerted report, and nothing else unalerted."""
    async with await AsyncConnection.connect(ADMIN_URL, autocommit=True) as conn:
        await conn.execute("truncate pgmq.q_room_finished, pgmq.a_room_finished")
        await conn.execute("delete from public.member_reports")
        await conn.execute(
            "insert into public.countries (code) values ('FR') on conflict do nothing"
        )
        cur = await conn.execute(
            "insert into public.rooms (code, mode, state, country) select '999998', gm.slug,"
            " 'lobby', 'FR' from public.game_modes gm limit 1 returning id"
        )
        row = await cur.fetchone()
        assert row is not None, "no game_modes row: the seed is missing"
        room_id: uuid.UUID = row[0]
        try:
            cur = await conn.execute(
                "insert into public.room_members (room_id, display_name, avatar_key)"
                " select %s, n, 'default' from unnest(array['a', 'b']) n returning id",
                (room_id,),
            )
            seats = [r[0] for r in await cur.fetchall()]
            cur = await conn.execute(
                "insert into public.member_reports (room_id, reporter_member_id,"
                " reported_member_id, reason) values (%s, %s, %s, 'spam') returning id",
                (room_id, seats[0], seats[1]),
            )
            report = await cur.fetchone()
            assert report is not None
            yield conn, report[0]
        finally:
            await conn.execute("delete from public.rooms where id = %s", (room_id,))
            await conn.execute("truncate pgmq.q_room_finished, pgmq.a_room_finished")


async def test_one_loop_alerts_a_new_report_and_marks_it(
    database: Database, admin_report: tuple[AsyncConnection, uuid.UUID]
) -> None:
    conn, report_id = admin_report
    sink = FakeSink()
    async with database.connection() as pipeline:
        assert await check_once(pipeline, sink) is True

    report_alerts = [a for a in sink.alerts if a.signal == "new_reports"]
    assert len(report_alerts) == 1
    assert report_alerts[0].tags == {"report_ids": str(report_id)[:8]}
    assert sink.check_ins == ["in_progress", "ok"]
    cur = await conn.execute(
        "select alerted_at is not null from public.member_reports where id = %s", (report_id,)
    )
    row = await cur.fetchone()
    assert row is not None and row[0] is True

    # The next loop has nothing new to say about it.
    sink = FakeSink()
    async with database.connection() as pipeline:
        await check_once(pipeline, sink)
    assert [a for a in sink.alerts if a.signal == "new_reports"] == []


async def test_a_stopped_consumer_lets_room_finished_age_past_its_threshold(
    database: Database, admin_report: tuple[AsyncConnection, uuid.UUID]
) -> None:
    conn, _ = admin_report
    async with database.connection() as pipeline:
        await enqueue(pipeline, "room_finished", RoomFinishedMessage(room_id=uuid.uuid4()))
    await conn.execute(
        "update pgmq.q_room_finished set enqueued_at = now() - interval '20 minutes'"
    )

    async with database.connection() as pipeline:
        health = await ops_health(pipeline)
    signal = next(s for s in health.signals if s.name == "queue_age:room_finished")
    assert signal.crossed is True
    assert signal.threshold == 900
    assert signal.value is not None and signal.value >= 1200
