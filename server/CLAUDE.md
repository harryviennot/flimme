# server/

The Python recommendation server: it ranks decks, learns, and makes every outside call. Load the `python-server` skill before changing anything here.

- Python 3.13 with uv. From this folder: `uv sync`, `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format .`, `uv run pyright`, `uv run server api`.
- Settings come from the environment and `.env.local` (`.env.example` lists them), validated at start in `src/server/config.py`.
- Logic lives in pure functions (`src/server/engine/` and friends); I/O stays at the edges. Every queue handler must be safe to run twice.
- Tests never touch the network. Committed fixtures are synthetic, in TMDB's response shape, with movie ids from 60,000,001. A real response may be recorded into the git-ignored `tests/fixtures/.recorded/` and turned into a fixture with `tools/scrub_fixture.py`; never commit a raw one.
- `server api` (`GET /healthz`) and `server pipeline-worker` (the `catalog_refresh` loop; handles the `reference_weekly` job so far) do something today; the other commands say which roadmap milestone builds them.
- Contract tests (`tests/contract`) need a database with the real schema: `supabase start`, or the lite database with `CONTRACT_ADMIN_DATABASE_URL`. See README.md.
