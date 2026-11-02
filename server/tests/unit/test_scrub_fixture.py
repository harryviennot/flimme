"""The scrub script keeps the shape and removes everything real (synthetic input only)."""

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).parents[2] / "tools" / "scrub_fixture.py"


def load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("scrub_fixture", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Made up for this test: shaped like a TMDB detail, holding nothing from TMDB.
SAMPLE = {
    "adult": False,
    "backdrop_path": "/abcdefg.jpg",
    "genres": [{"id": 28, "name": "Some genre"}],
    "id": 424242,
    "imdb_id": "tt1234567",
    "original_language": "fr",
    "overview": "Some real looking text.",
    "popularity": 55.123,
    "release_date": "1999-12-31",
    "runtime": 120,
    "belongs_to_collection": None,
    "results": [{"id": 424242, "title": "Same film again"}, {"id": 515151, "title": "Other"}],
}


def shape(value):
    if isinstance(value, dict):
        return {k: shape(v) for k, v in value.items()}
    if isinstance(value, list):
        return [shape(v) for v in value]
    return type(value).__name__


def test_keeps_every_key_and_type():
    out = load().Scrubber().scrub(SAMPLE)
    assert shape(out) == shape(SAMPLE)
    assert list(out) == list(SAMPLE)


def test_replaces_ids_with_invented_ones_consistently():
    out = load().Scrubber().scrub(SAMPLE)
    assert out["id"] >= 60_000_001
    assert out["results"][0]["id"] == out["id"]
    assert out["results"][1]["id"] != out["id"]


def test_leaves_nothing_real_behind():
    text = json.dumps(load().Scrubber().scrub(SAMPLE))
    for real in ["424242", "515151", "abcdefg", "tt1234567", "real looking", "Same film", "55.123"]:
        assert real not in text
    assert "/fixture-" in text


def test_is_repeatable():
    module = load()
    assert module.Scrubber().scrub(SAMPLE) == module.Scrubber().scrub(SAMPLE)


def test_cli_writes_the_output(tmp_path: Path):
    source = tmp_path / "in.json"
    target = tmp_path / "out" / "x.json"
    source.write_text(json.dumps(SAMPLE), encoding="utf-8")
    assert load().main(["scrub_fixture.py", str(source), str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["id"] >= 60_000_001


def test_cli_needs_two_arguments(capsys: pytest.CaptureFixture[str]):
    assert load().main(["scrub_fixture.py"]) == 2
    assert "usage" in capsys.readouterr().err
