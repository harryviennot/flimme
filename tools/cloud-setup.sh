#!/usr/bin/env bash
# Setup script for Claude Code cloud sessions (claude.ai/code). Paste into the cloud
# environment's settings (the environment menu in the session's title bar, then Edit,
# then Setup script):
#
#   bash "$(find /home/user -maxdepth 3 -path '*/tools/cloud-setup.sh' | head -1)" # cloud-setup 2
#
# The environment caches what this script writes and skips it in later sessions, until
# the setup script text changes. So after changing this file, bump the number at the end
# of that line, here and in docs/pipeline.md (section 5), and paste it into the environment.
#
# It installs what agents need to run every check in the container: mise and the tools
# mise.toml pins (node, pnpm, python, uv, the Supabase CLI, lefthook and the rest), the
# JavaScript and Python dependencies, and Postgres 16 with pgTAP and pgvector for the
# lite database. The full Supabase stack can't run here (Docker image pulls are
# rate-limited), so SQL is tested on the lite database; the real stack runs in CI and on
# the Mac. Cloud sessions only: on the Mac, mise comes from Homebrew and `mise run setup`
# does the rest.
# Safe to run twice. Needs no secrets. Runs as root, as cloud setup scripts do.
set -euo pipefail

if [[ "$(uname -s)" != Linux ]]; then
  echo "cloud-setup: this script is for Linux cloud sessions. On the Mac, run: mise run setup" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
export DEBIAN_FRONTEND=noninteractive MISE_YES=1

# mise is a pinned release from GitHub, checked against the release's SHASUMS256.txt.
# Not `curl https://mise.run | sh`: mise.run isn't on the Trusted network allowlist, and
# github.com is. To move to a newer mise, change the version and both checksums.
mise_version=2026.11.0
mise_sha256_x64=cf48795ee2cb3f8822ba0ed4b45d729b791fe0c984baf6080ebb7b0c1ba23119
mise_sha256_arm64=92f90c094b6eab2dcdbc46f2b977a78bba82a9311fe0c592c17e403a8d0ec621
mise_shims="${MISE_DATA_DIR:-$HOME/.local/share/mise}/shims"

network_hint() {
  echo "cloud-setup: a 403 or a connection error here means the environment's network access" >&2
  echo "             blocks the download. Trusted access allows github.com, nodejs.org, npm and" >&2
  echo "             PyPI. See docs/pipeline.md, section 5." >&2
}

download() { # url destination
  if ! curl --fail --silent --show-error --location --retry 2 --connect-timeout 20 -o "$2" "$1"; then
    echo "cloud-setup: could not download $1" >&2
    network_hint
    exit 1
  fi
}

install_mise() {
  local arch sha url tmp
  case "$(uname -m)" in
    x86_64) arch=x64 sha=$mise_sha256_x64 ;;
    aarch64 | arm64) arch=arm64 sha=$mise_sha256_arm64 ;;
    *)
      echo "cloud-setup: no mise build for $(uname -m)" >&2
      exit 1
      ;;
  esac
  url="https://github.com/jdx/mise/releases/download/v$mise_version/mise-v$mise_version-linux-$arch.tar.gz"
  tmp="$(mktemp -d)"
  download "$url" "$tmp/mise.tar.gz"
  if ! echo "$sha  $tmp/mise.tar.gz" | sha256sum --check --status; then
    echo "cloud-setup: the mise download doesn't match its checksum ($url)" >&2
    rm -rf "$tmp"
    exit 1
  fi
  tar -xzf "$tmp/mise.tar.gz" -C "$tmp" mise/bin/mise
  install -m 0755 "$tmp/mise/bin/mise" /usr/local/bin/mise
  rm -rf "$tmp"
}

echo "cloud-setup: Postgres extensions"
apt-get update -qq
apt-get install -y -qq postgresql-16-pgtap postgresql-16-pgvector libtap-parser-sourcehandler-pgtap-perl >/dev/null
pg_ctlcluster 16 main start 2>/dev/null || true
su postgres -c "psql -Atc \"select 1 from pg_roles where rolname = '$(whoami)'\"" | grep -q 1 \
  || su postgres -c "createuser --superuser $(whoami)"

echo "cloud-setup: mise and the tools in mise.toml"
command -v mise >/dev/null 2>&1 || install_mise
mise trust --quiet "$root/mise.toml"
# Worktrees (.claude/worktrees/...) carry their own copy of mise.toml: trust the whole
# checkout, or `mise run` refuses to start in them.
mkdir -p /etc/mise
printf '# Written by tools/cloud-setup.sh\n[settings]\ntrusted_config_paths = ["%s"]\n' "$root" >/etc/mise/config.toml
if ! mise install --quiet; then
  echo "cloud-setup: mise install failed (the error is above). The tools come from nodejs.org" >&2
  echo "             and GitHub releases." >&2
  network_hint
  exit 1
fi

# The shims put the pinned tools first on PATH in every later shell: login shells read
# /etc/profile.d, and the line at the top of ~/.bashrc (before its "not interactive,
# stop here" guard) covers the others. Outside the repository, a shim falls through to
# the image's own tool. mise itself is in /usr/local/bin, on PATH everywhere.
cat >/etc/profile.d/mise.sh <<EOF
# Written by tools/cloud-setup.sh: the tools mise.toml pins come first on PATH.
case ":\$PATH:" in *":$mise_shims:"*) ;; *) export PATH="$mise_shims:\$PATH" ;; esac
EOF
bashrc_line='if [ -f /etc/profile.d/mise.sh ]; then . /etc/profile.d/mise.sh; fi # tools/cloud-setup.sh'
if ! grep -qxF "$bashrc_line" "$HOME/.bashrc" 2>/dev/null; then
  { echo "$bashrc_line"; cat "$HOME/.bashrc" 2>/dev/null || true; } >"$HOME/.bashrc.cloud-setup"
  mv "$HOME/.bashrc.cloud-setup" "$HOME/.bashrc"
fi
export PATH="$mise_shims:$PATH"

echo "cloud-setup: JavaScript dependencies"
pnpm install --frozen-lockfile --loglevel=error

echo "cloud-setup: Python dependencies"
(cd server && uv sync --frozen --quiet)

echo "cloud-setup: the lite database"
bash supabase/lite/load.sh

echo "cloud-setup: done"
