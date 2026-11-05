"""The `server` command: one entry point for every process and one-off job.

`api`, `pipeline-worker` and `backfill` do something so far. The other commands name the
roadmap milestone that builds them and exit with code 2.
"""

import argparse
import logging
import sys
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import ValidationError

from server.config import MissingSetting, Process, Settings

EXIT_USAGE = 2


@dataclass(frozen=True)
class Planned:
    """A command that is in the design but not built yet."""

    name: str
    help: str
    milestone: str  # the roadmap task that builds it, e.g. "M17.4"
    what: str  # what that task is called


PLANNED = (
    Planned(
        "deck-worker",
        "consume the deck_requests queue and deal decks",
        "M17.4",
        "the deck worker without taste",
    ),
    Planned(
        "trainer", "nightly title stats, training exports and evaluation", "M22.1", "the trainer"
    ),
    Planned(
        "replay",
        "the simulation harness: bot players and log replay against a recipe",
        "M17.5",
        "live learning, tested on recorded games; the harness grows from there",
    ),
    Planned(
        "moods-review",
        "review the deck engine's mood lists",
        "M17.12",
        "curate the six moods with the review script",
    ),
)


def _positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{value!r} is not a whole number") from None
    if number < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="server", description="Flimme recommendation server.")
    commands = parser.add_subparsers(dest="command", required=True, metavar="command")

    api = commands.add_parser("api", help="run the HTTP API")
    api.add_argument(
        "--host", default="127.0.0.1", help="address to listen on (default: %(default)s)"
    )
    api.add_argument(
        "--port", type=int, default=8000, help="port to listen on (default: %(default)s)"
    )

    commands.add_parser(
        "pipeline-worker",
        help="consume the catalog_refresh and room_finished queues (others join with their tasks)",
    )

    backfill = commands.add_parser(
        "backfill",
        help="load the top films from TMDB into the catalog, resuming an interrupted load",
    )
    backfill.add_argument(
        "--limit",
        type=_positive_int,
        metavar="N",
        help="load at most N candidates (also seeds a local catalog); default: the top 60,000",
    )

    for planned in PLANNED:
        command = commands.add_parser(
            planned.name, help=f"{planned.help} (not built yet: {planned.milestone})"
        )
        # Accept and ignore arguments such as `trainer nightly`, so the message below
        # is what the person sees rather than a usage error.
        command.add_argument("args", nargs="*", help=argparse.SUPPRESS)
    return parser


def load_settings(command: str, process: Process) -> Settings | None:
    """The settings, or None after printing what is wrong (never a value)."""
    try:
        settings = Settings.load()
        settings.database_url_for(process)
    except MissingSetting as error:
        print(f"server {command}: {error.variable} is not set.", file=sys.stderr)
        print("Copy .env.example to .env.local, or set the variable.", file=sys.stderr)
        return None
    except ValidationError as error:
        print(f"server {command}: the settings are not valid:", file=sys.stderr)
        for problem in error.errors():
            setting = ".".join(str(part) for part in problem["loc"]).upper()
            print(f"  {setting}: {problem['msg']}", file=sys.stderr)
        print("Copy .env.example to .env.local, or set the variables.", file=sys.stderr)
        return None
    return settings


def configure_logging() -> None:
    """INFO for our own loggers. `httpx` and `httpcore` log every request at INFO, which on the
    first full load is about 120,000 lines (and a line is a URL), so they speak at WARNING."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def run_pipeline_worker() -> int:
    settings = load_settings("pipeline-worker", Process.PIPELINE)
    if settings is None:
        return 1

    import asyncio

    from server.workers.pipeline import run_pipeline_worker as serve

    configure_logging()
    asyncio.run(serve(settings))
    return 0


def run_backfill(limit: int | None) -> int:
    settings = load_settings("backfill", Process.PIPELINE)
    if settings is None:
        return 1
    if settings.tmdb_token is None:
        print("server backfill: TMDB_READ_TOKEN is not set.", file=sys.stderr)
        print("Copy .env.example to .env.local, or set the variable.", file=sys.stderr)
        return 1

    import asyncio

    from server.catalog.backfill import BackfillFailed, backfill_from_settings, summary_line

    configure_logging()
    try:
        result = asyncio.run(backfill_from_settings(settings, limit))
    except BackfillFailed as error:
        print(f"server backfill: {error}.", file=sys.stderr)
        return 1
    except Exception as error:
        # The run stays open; running the command again resumes it.
        print(
            f"server backfill: stopped ({type(error).__name__}). Run it again to resume.",
            file=sys.stderr,
        )
        return 1
    print(
        f"server backfill: run {result.run_id} done, {result.candidates} candidates, "
        f"{result.quality_scores} quality scores set."
    )
    print(summary_line(result))
    return 0


def run_api(host: str, port: int) -> int:
    settings = load_settings("api", Process.API)
    if settings is None:
        return 1
    if settings.supabase_url is None:
        print("server api: SUPABASE_URL is not set.", file=sys.stderr)
        print("Copy .env.example to .env.local, or set the variable.", file=sys.stderr)
        return 1

    import uvicorn

    from server.api.app import create_app

    configure_logging()
    uvicorn.run(create_app(settings), host=host, port=port)
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "api":
        return run_api(args.host, args.port)
    if args.command == "pipeline-worker":
        return run_pipeline_worker()
    if args.command == "backfill":
        return run_backfill(args.limit)

    planned = next(p for p in PLANNED if p.name == args.command)
    print(
        f"server {planned.name}: not built yet. "
        f"Roadmap {planned.milestone} builds it ({planned.what}).",
        file=sys.stderr,
    )
    return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
