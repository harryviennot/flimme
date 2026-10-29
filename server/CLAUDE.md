# server/

The Python recommendation server: it ranks decks, learns, and makes every outside call. Load the `python-server` skill before changing anything here.

- Python 3.13 with uv. From this folder: `uv sync`, `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format .`, `uv run pyright`, `uv run server api`.
- Settings come from the environment and `.env.local` (`.env.example` lists them), validated at start in `src/server/config.py`.
- Logic lives in pure functions (`src/server/engine/` and friends); I/O stays at the edges. Every queue handler must be safe to run twice.
- Tests never touch the network: record TMDB and Letterboxd responses into `tests/fixtures/`.
- Only `server api` does something today (`GET /healthz`); the other commands say which roadmap milestone builds them.
