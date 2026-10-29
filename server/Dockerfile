# One image for every process: `server api`, `server deck-worker`, `server pipeline-worker`,
# `server trainer`, `server backfill`. The command is picked when the container starts.
#
#   docker build -t moviematch-server server/
#   docker run --rm -p 8000:8000 --env-file server/.env.local moviematch-server
#   docker run --rm --env-file server/.env.local moviematch-server deck-worker
#
# Build context: this folder (server/).

FROM python:3.13-slim AS build

# uv from its official image, pinned to the version the lock file was made with.
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_NO_DEV=1

WORKDIR /app

# The dependencies first, so this layer is reused until pyproject.toml or uv.lock changes.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project

# Then the project itself, installed into the virtual environment (not editable, so the
# final image does not need src/).
COPY README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable


FROM python:3.13-slim

# A fixed, unprivileged user: the server needs no write access to anything.
RUN groupadd --system --gid 10001 server \
    && useradd --system --uid 10001 --gid server --no-create-home --shell /usr/sbin/nologin server

COPY --from=build /app/.venv /app/.venv

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER server
WORKDIR /home/server

EXPOSE 8000

# `docker run <image> deck-worker` runs `server deck-worker`. With no command the image
# starts the HTTP API, listening on all addresses so the container's port can be published.
ENTRYPOINT ["server"]
CMD ["api", "--host", "0.0.0.0"]
