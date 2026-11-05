"""The pipeline worker: it consumes `catalog_refresh` and `room_finished` (decision Q33, M6.8).

Handlers register by message kind. M2.5, M2.7, M2.9, M2.10 and M2.11 each add one line to
`HANDLERS` or `JOBS`. A valid message whose kind has no handler is rejected (archived and
logged), and so is a body that fails validation: both are bad input that will never succeed.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field

from pydantic import ValidationError

from server.catalog.curation import Curation, load_curation
from server.catalog.fetch import run_fetch
from server.catalog.placeholders import Posters
from server.catalog.popularity import ExportLoader, ExportSource, run_popularity_daily
from server.catalog.reference import apply_curation, run_reference_weekly
from server.catalog.refresh import run_changes_daily, run_details_monthly, run_details_weekly
from server.catalog.sweep import run_availability_sweep, run_sweep
from server.catalog.tmdb import TmdbClient
from server.config import Process, Settings
from server.db.payloads import (
    CatalogRefreshAdapter,
    CatalogRefreshMessage,
    FetchMessage,
    JobMessage,
    SweepMessage,
)
from server.db.pool import Database
from server.db.queues import PgmqClient
from server.ops.health import SentrySink, run_health_loop
from server.rooms.finished import make_room_finished_handler
from server.workers.runner import (
    Delivery,
    Handler,
    Outcome,
    QueueRunner,
    QueueSpec,
    Reject,
    install_signal_handlers,
)

log = logging.getLogger(__name__)

CATALOG_REFRESH = QueueSpec("catalog_refresh", vt_s=300, poison_after=5, concurrency=4)

ROOM_FINISHED = QueueSpec("room_finished", vt_s=60, poison_after=5, concurrency=2)

KindHandler = Callable[[CatalogRefreshMessage, Delivery], Awaitable[Outcome]]

# kind ("job", "fetch", "sweep") -> handler. All three are added in run_pipeline_worker (they
# need the context).
HANDLERS: dict[str, KindHandler] = {}


@dataclass(frozen=True)
class Context:
    """What the jobs share: the database, the one TMDB client (None without a token), curation."""

    database: Database
    tmdb: TmdbClient | None
    curation: Curation
    exports: ExportLoader = field(default_factory=ExportSource)
    posters: Posters | None = None  # makes poster placeholders; None makes none


JobRunner = Callable[[Context], Awaitable[Outcome]]


async def _reference_weekly(context: Context) -> Outcome:
    if context.tmdb is None:
        raise RuntimeError("TMDB_READ_TOKEN is not set")
    return await run_reference_weekly(context.database, context.tmdb, context.curation)


async def _popularity_daily(context: Context) -> Outcome:
    # The export file needs no key, so this job runs without a TMDB token.
    return await run_popularity_daily(context.database, context.exports)


async def _availability_sweep(context: Context) -> Outcome:
    # Opening the run and sending the steps needs no TMDB token; the steps do. The flags come
    # first: a sweep never runs on flags older than the file this process loaded.
    await apply_curation(context.database, context.curation)
    return await run_availability_sweep(context.database)


async def _changes_daily(context: Context) -> Outcome:
    if context.tmdb is None:
        raise RuntimeError("TMDB_READ_TOKEN is not set")
    return await run_changes_daily(context.database, context.tmdb)


async def _details_weekly(context: Context) -> Outcome:
    # Sending the fetches needs no TMDB token; the fetches do.
    return await run_details_weekly(context.database)


async def _details_monthly(context: Context) -> Outcome:
    return await run_details_monthly(context.database)


# job name -> runner: all six jobs of the schedule (migration catalog_schedule).
JOBS: dict[str, JobRunner] = {
    "reference_weekly": _reference_weekly,
    "popularity_daily": _popularity_daily,
    "availability_sweep": _availability_sweep,
    "changes_daily": _changes_daily,
    "details_weekly": _details_weekly,
    "details_monthly": _details_monthly,
}


def make_job_handler(context: Context, jobs: Mapping[str, JobRunner] = JOBS) -> KindHandler:
    async def handle(message: CatalogRefreshMessage, delivery: Delivery) -> Outcome:
        assert isinstance(message, JobMessage)
        job = jobs.get(message.job)
        if job is None:
            return Reject(f"no runner for job {message.job!r}")
        return await job(context)

    return handle


def make_fetch_handler(context: Context) -> KindHandler:
    async def handle(message: CatalogRefreshMessage, delivery: Delivery) -> Outcome:
        assert isinstance(message, FetchMessage)
        if context.tmdb is None:
            raise RuntimeError("TMDB_READ_TOKEN is not set")
        return await run_fetch(context.database, context.tmdb, message, context.posters)

    return handle


def make_sweep_handler(context: Context) -> KindHandler:
    async def handle(message: CatalogRefreshMessage, delivery: Delivery) -> Outcome:
        assert isinstance(message, SweepMessage)
        if context.tmdb is None:
            raise RuntimeError("TMDB_READ_TOKEN is not set")
        return await run_sweep(context.database, context.tmdb, message)

    return handle


def make_dispatcher(handlers: Mapping[str, KindHandler]) -> Handler:
    async def dispatch(delivery: Delivery) -> Outcome:
        try:
            message = CatalogRefreshAdapter.validate_python(delivery.body)
        except ValidationError as error:
            # Field names and error types only: the input may not be ours to log.
            problems = ", ".join(
                f"{'.'.join(str(p) for p in e['loc']) or 'body'}: {e['type']}"
                for e in error.errors(include_input=False)
            )
            return Reject(f"does not validate ({problems})")
        handler = handlers.get(message.kind)
        if handler is None:
            return Reject(f"no handler for kind {message.kind!r}")
        return await handler(message, delivery)

    return dispatch


async def run_pipeline_worker(settings: Settings) -> None:
    """Consume until SIGTERM or SIGINT, then let the handlers in progress finish."""
    database = await Database.open(settings.database_url_for(Process.PIPELINE))
    client = PgmqClient(database)
    finished_client = PgmqClient(database)
    tmdb = TmdbClient(settings.tmdb_token.get_secret_value()) if settings.tmdb_token else None
    posters = Posters()
    context = Context(database, tmdb, load_curation(), posters=posters)
    handlers = {
        **HANDLERS,
        "job": make_job_handler(context),
        "fetch": make_fetch_handler(context),
        "sweep": make_sweep_handler(context),
    }
    stop = asyncio.Event()
    remove_signal_handlers = install_signal_handlers(stop)
    try:
        # Before the first message: the file is the truth, whatever the weekly job last did.
        stats = await apply_curation(database, context.curation)
        log.info("curation applied at start %s", stats)
        runner = QueueRunner(CATALOG_REFRESH, make_dispatcher(handlers), client)
        # Its own client: read_with_poll holds a reader connection while it waits.
        finished_runner = QueueRunner(
            ROOM_FINISHED, make_room_finished_handler(database), finished_client
        )
        try:
            loops = [runner.run(stop), finished_runner.run(stop)]
            if settings.sentry_dsn is not None:
                # Its own timer, not a queued message: a broken pg_cron or a backed-up
                # catalog_refresh is what it has to catch (M9.5).
                loops.append(run_health_loop(database, SentrySink(), stop))
            else:
                log.info("health check is off: SENTRY_DSN is not set")
            await asyncio.gather(*loops)
        finally:
            stop.set()
    finally:
        remove_signal_handlers()
        await client.close()
        await finished_client.close()
        await posters.aclose()
        if tmdb is not None:
            await tmdb.aclose()
        await database.close()
