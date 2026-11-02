"""Turn a recorded TMDB response into a committable fixture.

Usage: python tools/scrub_fixture.py tests/fixtures/.recorded/x.json tests/fixtures/tmdb/x.json

Keeps every key, every type and the order. Replaces ids with invented ones (from 60,000,001),
strings with invented text, image paths with `/fixture-<n>.jpg`, numbers with made-up values.
Language and country codes, booleans and nulls are kept: they are not TMDB's content.
Nothing real survives, so the output may go into git (CLAUDE.md rule 7).
"""

import json
import random
import sys
from pathlib import Path
from typing import Any

FIRST_INVENTED_ID = 60_000_001
KEPT_STRING_KEYS = {"original_language", "iso_639_1", "iso_3166_1", "status", "media_type"}


class Scrubber:
    def __init__(self, seed: int = 0) -> None:
        self._rng = random.Random(seed)
        self._next_id = FIRST_INVENTED_ID
        self._ids: dict[int, int] = {}
        self._texts = 0

    def scrub(self, value: Any, key: str = "") -> Any:
        if isinstance(value, dict):
            return {k: self.scrub(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [self.scrub(v, key) for v in value]
        if isinstance(value, bool) or value is None:
            return value
        if isinstance(value, int):
            return self._id(value) if key == "id" else self._rng.randint(1, 5000)
        if isinstance(value, float):
            return round(self._rng.uniform(0.0, 10.0), 3)
        if isinstance(value, str):
            return self._string(value, key)
        return value

    def _id(self, real: int) -> int:
        # The same real id maps to the same invented one, so references stay consistent.
        if real not in self._ids:
            self._ids[real] = self._next_id
            self._next_id += 1
        return self._ids[real]

    def _string(self, value: str, key: str) -> str:
        if key in KEPT_STRING_KEYS:
            return value
        self._texts += 1
        if key.endswith("_path"):
            return f"/fixture-{self._texts}.jpg"
        if key == "imdb_id":
            return f"tt{9_000_000 + self._texts:07d}"
        if key.endswith("_date"):
            return f"2000-01-{self._texts % 28 + 1:02d}"
        return f"Invented text {self._texts}"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: scrub_fixture.py INPUT OUTPUT", file=sys.stderr)
        return 2
    data = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    out = Path(argv[2])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(Scrubber().scrub(data), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
