"""The `server` command: one entry point for every process and one-off job.

Only `api` does something so far. The other commands name the roadmap milestone
that builds them and exit with code 2.
"""

import argparse
import sys
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import ValidationError

from server.config import Settings

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
        "pipeline-worker",
        "consume the other queues: catalog, Letterboxd, taste, end of room",
        "M2.2",
        "database layer and queue consumer, with the handlers from M2.5 on",
    ),
    Planned(
        "trainer", "nightly title stats, training exports and evaluation", "M22.1", "the trainer"
    ),
    Planned(
        "backfill",
        "the first catalog load from TMDB",
        "M2.9",
        "which films, and the backfill command",
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

    for planned in PLANNED:
        command = commands.add_parser(
            planned.name, help=f"{planned.help} (not built yet: {planned.milestone})"
        )
        # Accept and ignore arguments such as `trainer nightly`, so the message below
        # is what the person sees rather than a usage error.
        command.add_argument("args", nargs="*", help=argparse.SUPPRESS)
    return parser


def run_api(host: str, port: int) -> int:
    try:
        Settings.load()
    except ValidationError as error:
        print("server api: the settings are not valid:", file=sys.stderr)
        for problem in error.errors():
            setting = ".".join(str(part) for part in problem["loc"]).upper()
            print(f"  {setting}: {problem['msg']}", file=sys.stderr)
        print("Copy .env.example to .env.local, or set the variables.", file=sys.stderr)
        return 1

    import uvicorn

    from server.api.app import app

    uvicorn.run(app, host=host, port=port)
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "api":
        return run_api(args.host, args.port)

    planned = next(p for p in PLANNED if p.name == args.command)
    print(
        f"server {planned.name}: not built yet. "
        f"Roadmap {planned.milestone} builds it ({planned.what}).",
        file=sys.stderr,
    )
    return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
