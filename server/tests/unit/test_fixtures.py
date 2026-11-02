"""Committed fixtures are synthetic: movie ids sit in the invented range (CLAUDE.md rule 7)."""

import json
from pathlib import Path
from typing import Any

FIRST_INVENTED_ID = 60_000_001


def movie_ids(document: Any) -> list[int]:
    """Movie ids in TMDB's shapes: a detail's own id, and each result of a list page."""
    ids: list[int] = []
    if isinstance(document, dict):
        if isinstance(document.get("id"), int):
            ids.append(document["id"])
        for item in document.get("results", []):
            if isinstance(item, dict) and isinstance(item.get("id"), int):
                ids.append(item["id"])
    return ids


def test_every_committed_fixture_uses_only_invented_movie_ids(fixtures_dir: Path):
    files = [
        path
        for path in fixtures_dir.rglob("*.json")
        if ".recorded" not in path.relative_to(fixtures_dir).parts
    ]
    assert files, "no fixtures found"
    for path in files:
        for movie_id in movie_ids(json.loads(path.read_text(encoding="utf-8"))):
            assert movie_id >= FIRST_INVENTED_ID, f"{path.name} holds a real movie id"


def test_the_id_check_catches_a_real_id():
    assert movie_ids({"id": 603, "results": [{"id": 60000002}]}) == [603, 60000002]
