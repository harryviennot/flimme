#!/usr/bin/env bash
# Setup script for Claude Code cloud sessions (claude.ai/code). Paste into the cloud
# environment's settings (the environment menu in the session's title bar, then Edit,
# then Setup script):
#
#   bash "$(find /home/user -maxdepth 3 -path '*/tools/cloud-setup.sh' | head -1)"
#
# It installs what agents need to run every check in the container: the JavaScript and
# Python dependencies, and Postgres 16 with pgTAP and pgvector for the lite database.
# The full Supabase stack can't run here (Docker image pulls are rate-limited), so SQL is
# tested on the lite database; the real stack runs in CI and on the Mac.
# Safe to run twice. Needs no secrets.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

echo "cloud-setup: Postgres extensions"
apt-get update -qq
apt-get install -y -qq postgresql-16-pgtap postgresql-16-pgvector libtap-parser-sourcehandler-pgtap-perl >/dev/null
pg_ctlcluster 16 main start 2>/dev/null || true
su postgres -c "psql -Atc \"select 1 from pg_roles where rolname = '$(whoami)'\"" | grep -q 1 \
  || su postgres -c "createuser --superuser $(whoami)"

echo "cloud-setup: JavaScript dependencies"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

echo "cloud-setup: Python dependencies"
(cd server && uv sync --frozen)

echo "cloud-setup: the lite database"
bash supabase/lite/load.sh

echo "cloud-setup: done"
