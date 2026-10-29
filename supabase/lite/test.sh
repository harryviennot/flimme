#!/usr/bin/env bash
# Run the pgTAP tests of supabase/tests/ against the lite database (load it
# first with load.sh). Skips the tests that need the real Supabase stack
# (files named *.stack.test.sql). Exits non-zero if any test fails.
#
# Uses pg_prove; if it is not installed, falls back to running each file with
# psql and reading the TAP output.
#
# Environment variables:
#   LITE_DB   database to test (default movie_swipe_lite)
# Extra arguments are test files to run instead of the whole folder.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
db="${LITE_DB:-movie_swipe_lite}"
tests_dir="$repo/supabase/tests"

export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
export PGDATABASE="$db"

if ! psql -X -q -Atc "select 1" >/dev/null 2>&1; then
  echo "test.sh: cannot connect to database '$db'. Run supabase/lite/load.sh first." >&2
  exit 1
fi

# Same order as `supabase test db`: alphabetical, so 000-helpers.sql goes first.
if (($# > 0)); then
  files=("$@")
else
  mapfile -t files < <(find "$tests_dir" -type f -name '*.sql' ! -name '*.stack.test.sql' | LC_ALL=C sort)
fi
mapfile -t skipped < <(find "$tests_dir" -type f -name '*.stack.test.sql' | LC_ALL=C sort)

if ((${#files[@]} == 0)); then
  echo "test.sh: no test files found under supabase/tests" >&2
  exit 1
fi
if ((${#skipped[@]} > 0)); then
  echo "test.sh: skipping ${#skipped[@]} stack-only file(s):" >&2
  printf '           %s\n' "${skipped[@]#"$repo"/}" >&2
fi

if command -v pg_prove >/dev/null 2>&1; then
  exec pg_prove --dbname "$db" "${files[@]}"
fi

echo "test.sh: pg_prove not found, running the files with psql" >&2
failed=0
for f in "${files[@]}"; do
  out="$(psql -X -q -At -v ON_ERROR_STOP=1 -f "$f" 2>&1)" || failed=1
  echo "$out" | grep -E '^(ok|not ok|# )|ERROR' || true
  if echo "$out" | grep -qE '^not ok|^# Looks like|ERROR'; then failed=1; fi
done
if ((failed)); then
  echo "test.sh: FAILED" >&2
  exit 1
fi
echo "test.sh: all files passed"
