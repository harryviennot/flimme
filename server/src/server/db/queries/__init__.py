"""The server's own SQL, one file per query (server-structure.md#the-database-layer).

A column rename shows up here and in the contract tests. `load("name")` returns `name.sql`.
"""

from pathlib import Path
from typing import LiteralString, cast

_DIRECTORY = Path(__file__).parent


def load(name: str) -> LiteralString:
    # Our own files, never user input, so psycopg may take them as literal SQL.
    return cast(LiteralString, (_DIRECTORY / f"{name}.sql").read_text(encoding="utf-8"))
