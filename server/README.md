# server/

The Flimme recommendation server: one Python codebase that runs as the deck worker, the pipeline worker, the HTTP API and the trainer. The design is in [server-structure.md](../docs/architecture/server-structure.md); this folder is the skeleton from roadmap task M2.1. Only `server api` and its `GET /health` route exist so far.

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
curl http://127.0.0.1:8000/health  # {"status":"ok"}
```

| Command | Status |
| --- | --- |
| `server api` | Runs the FastAPI app. Refuses to start if the settings are invalid |
| `server pipeline-worker` | Not built yet: M2.2, handlers from M2.5 on |
| `server backfill` | Not built yet: M2.9 |
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
| `DATABASE_URL` | yes | The `app_server` login's `postgresql://` URL |
| `TMDB_READ_TOKEN` | no | TMDB's read access token |
| `SENTRY_DSN` | no | Error reports |

For a database to run against without Docker, use the lite database of cloud sessions ([supabase/lite/README.md](../supabase/lite/README.md)), for example `DATABASE_URL=postgresql:///movie_swipe_lite`. On a Mac, use the local Supabase stack (`supabase start`).

## Test and check

```sh
uv run pytest -q             # unit tests; no database or network needed so far
uv run ruff check            # lint (rules E, F, I, UP, B, SIM; line length 100)
uv run ruff format --check   # formatting (drop --check to apply it)
uv run pyright               # types, standard mode
```

Tests are in `tests/`: `unit/` (pure code and the app through FastAPI's test client), and `contract/` (against a database with the real schema), `replay/` (simulation and recorded games) and `fixtures/` (recorded outside calls and small data), which are empty until the tasks that need them. The test client needs `httpx2`, so it is in the dev group next to `httpx`, which the server itself uses for outside calls.

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

The image has Python 3.13 (slim), the locked dependencies without the dev group, and a non-root user. It has not been built yet: Docker Hub throttles image pulls in cloud sessions, so the first build is on a machine with Docker.
