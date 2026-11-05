# server/

The Flimme recommendation server: one Python codebase that runs as the deck worker, the pipeline worker, the HTTP API and the trainer. The design is in [server-structure.md](../docs/architecture/server-structure.md); this folder is the skeleton from roadmap task M2.1. Only `server api` and its `GET /healthz` route exist so far.

## Install

You need [uv](https://docs.astral.sh/uv/) (it fetches Python 3.13 if the machine has none).

```sh
cd server
uv sync
```

## Run

Every process is a subcommand of one `server` command:

```sh
uv run server --help
uv run server api                  # the HTTP API on 127.0.0.1:8000 (--host and --port to change)
curl http://127.0.0.1:8000/healthz  # {"status":"ok"}, or 503 {"status":"db_unavailable"}
```

`server api` also needs `SUPABASE_URL`, and the local stack must publish a signing key, or no token can be checked. Once per machine: `supabase gen signing-key --algorithm ES256` writes `supabase/signing_keys.json` (ignored by version control: never commit it), then uncomment `signing_keys_path = "./signing_keys.json"` in your local `supabase/config.toml` (do not commit that line) and restart the stack. Check with `curl http://127.0.0.1:54321/auth/v1/.well-known/jwks.json`. The API refuses every request without a valid bearer token (`401`), except `/healthz`.

| Command | Status |
| --- | --- |
| `server api` | Runs the FastAPI app: `/healthz`, ES256 token checks against the project's signing keys, a 16 KB body limit. Refuses to start if the settings are invalid, naming the variable |
| `server pipeline-worker` | Consumes `catalog_refresh` and `room_finished` (needs `PIPELINE_DATABASE_URL`). Handles `fetch` messages and the `reference_weekly` and `popularity_daily` jobs so far; any other message is archived as unhandled |
| `server backfill [--limit N]` | The first catalog load (needs `PIPELINE_DATABASE_URL` and `TMDB_READ_TOKEN`): reference data, the top films of TMDB's daily export file, a fetch of each one that passes the floor, then C and every `quality_score`. `--limit N` caps the candidates: `--limit 2000` seeds a local or staging catalog. An interrupted run stays open; run the command again to resume it from `ingest_runs.cursor` |
| `server deck-worker` | Not built yet: M17.4 |
| `server replay` | Not built yet: M17.5 |
| `server moods-review` | Not built yet: M17.12 |
| `server trainer` | Not built yet: M22.1 |

A command that is not built prints the roadmap task that builds it and exits with code 2.

## Settings

Read from environment variables and validated when the process starts, in [src/server/config.py](src/server/config.py). For local development, copy the template and edit it; `.env.local` is git-ignored and read from this folder:

```sh
cp .env.example .env.local
```

| Variable | Required | What |
| --- | --- | --- |
| `ENVIRONMENT` | yes | `local`, `staging` or `production` |
| `PIPELINE_DATABASE_URL`, `DECK_DATABASE_URL`, `TRAINER_DATABASE_URL` | for that process | The process's own `app_server` login, a `postgresql://` URL |
| `API_DATABASE_URL` | for `server api` | The API's `app_http` login |
| `SUPABASE_URL` | for `server api` | The project's URL: `https://...`, or `http://127.0.0.1:54321` when local. The token issuer and the signing keys' address come from it |
| `DATABASE_URL` | local only | Stands in for any of the four above when `ENVIRONMENT=local` |
| `TMDB_READ_TOKEN` | no | TMDB's read access token |
| `SENTRY_DSN` | no | Error reports |

For a database to run against without Docker, use the lite database of cloud sessions ([supabase/lite/README.md](../supabase/lite/README.md)), for example `DATABASE_URL=postgresql:///movie_swipe_lite`. On a Mac, use the local Supabase stack (`supabase start`).

## Test and check

```sh
uv run pytest -q             # unit tests, plus the contract tests when a database is running
uv run ruff check            # lint (rules E, F, I, UP, B, SIM; line length 100)
uv run ruff format --check   # formatting (drop --check to apply it)
uv run pyright               # types, standard mode
```

Tests are in `tests/`: `unit/` (pure code and the app through FastAPI's test client), `contract/` (against a database with the real schema, logged in as the real server login), `replay/` (simulation and recorded games) and `fixtures/` (recorded outside calls and small data), the last two empty until the tasks that need them. The contract tests need `supabase start` (port 54322) or the lite database: point `CONTRACT_ADMIN_DATABASE_URL` at a superuser connection to it (the default is the local stack). They set no password (the stack is shared by every worktree): they connect as the superuser and `set role flimme_pipeline`, and empty the `catalog_refresh` queue around each test, and skip with a reason when there is no database; CI sets `REQUIRE_DATABASE=1`, so there a missing database fails them (the `server-contract` job). Async tests carry `pytestmark = pytest.mark.anyio`. The test client needs `httpx2`, so it is in the dev group next to `httpx`, which the server itself uses for outside calls.

## Layout

```
pyproject.toml, uv.lock, Dockerfile
src/server/
  config.py      settings from the environment, validated at start
  cli.py         the `server` command
  api/           FastAPI app (api/app.py)
  db/  engine/  taste/  moods/  catalog/  letterboxd/  rooms/  workers/  trainer/
                 empty packages for now: see the folder layout in server-structure.md
tests/
  unit/  contract/  replay/  fixtures/
```

## Docker

One image runs every process; the command is chosen when the container starts. The context is this folder.

```sh
docker build -t flimme-server .
docker run --rm -p 8000:8000 --env-file .env.local flimme-server               # server api
docker run --rm --env-file .env.local flimme-server pipeline-worker             # another process
```

The image has Python 3.13 (slim), the locked dependencies without the dev group, and a non-root user. CI builds it on every server change and runs `server --help` in it. Docker Hub throttles image pulls in cloud sessions, so build it on a machine with Docker.
