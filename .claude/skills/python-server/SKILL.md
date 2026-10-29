---
name: python-server
description: Conventions for the Python recommendation server in server/ (workers, the HTTP API, the TMDB pipeline, queues, tests). Use whenever writing, testing or reviewing code under server/.
---

# The server

Postgres decides the game; the server decides the deck, learns, and makes every outside call (TMDB, Letterboxd). It's never on the critical path: if it's slow or down, the database deals the SQL fallback. Background: docs/architecture/server-structure.md and recommendation-server.md, by section.

## Principles

1. **Load, compute, write.** A job reads what it needs, runs pure functions with no I/O, then writes the result. All the logic is in the pure middle, so it's tested without a database.
2. **Every message can arrive twice.** Each queue has a visibility timeout and a poison limit; every handler is safe to run again (check before writing, or write idempotently).
3. **The database decides, through functions.** The server writes decks and Letterboxd data only through `internal.*` functions, never by editing game tables.
4. **One image, several commands:** `server deck-worker`, `pipeline-worker`, `api`, `trainer`, plus one-offs (`backfill`, `replay`, `moods-review`).

## Layout

`src/server/`: `config.py` (settings validated at start), `cli.py`, `db/` (pool, queues, one typed wrapper per `internal.*` function, the server's own SQL in `queries/`), `engine/` (pure functions only), `catalog/` (TMDB), `letterboxd/`, `rooms/`, `workers/`, `api/` (FastAPI), `trainer/`. Tests in `tests/unit`, `tests/contract` (against a local database with the real schema), `tests/replay`, `tests/fixtures`.

## Rules

- Python 3.13, uv. Add a dependency with `uv add <pkg>` (never edit `uv.lock` by hand).
- Types everywhere; pyright must pass. Pydantic models for payloads crossing the database or HTTP.
- **No network in tests.** TMDB and Letterboxd responses are recorded once into `tests/fixtures/` and replayed.
- **TMDB:** a polite request rate, retries with backoff, 429 handling (tmdb.md#failures-and-retries). Its data never goes into git.
- **No personal data in logs**: ids only, never names, room codes or emails.
- The HTTP API checks the Supabase token (ES256, against the project's signing keys) on every route but `/healthz`.
- Each process has its own database login; only the HTTP API holds the Supabase secret key.

## Commands (from server/)

`uv sync`, `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format .`, `uv run pyright`, `uv run server api`. `mise run check` runs them for a changed server.
