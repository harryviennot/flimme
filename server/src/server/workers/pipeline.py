"""The pipeline worker: it consumes `catalog_refresh` and nothing else yet (decision Q33).

Handlers register by message kind. M2.5, M2.7, M2.9, M2.10 and M2.11 each add one line to
`HANDLERS`. A valid message whose kind has no handler is rejected (archived and logged), and
so is a body that fails validation: both are bad input that will never succeed.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping

from pydantic import ValidationError

from server.config import Process, Settings
from server.db.payloads import CatalogRefreshAdapter, CatalogRefreshMessage
from server.db.pool import Database
from server.db.queues import PgmqClient
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

KindHandler = Callable[[CatalogRefreshMessage, Delivery], Awaitable[Outcome]]

# kind ("job", "fetch", "sweep") -> handler. Empty until M2.5.
HANDLERS: dict[str, KindHandler] = {}


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
    stop = asyncio.Event()
    remove_signal_handlers = install_signal_handlers(stop)
    try:
        runner = QueueRunner(CATALOG_REFRESH, make_dispatcher(HANDLERS), client)
        await runner.run(stop)
    finally:
        remove_signal_handlers()
        await client.close()
        await database.close()
