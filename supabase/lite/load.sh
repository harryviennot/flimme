#!/usr/bin/env bash
# Drop and recreate the lite database, then load into it:
#   1. the stand-ins (supabase/lite/standins.sql)
#   2. every supabase/migrations/*.sql in order, or, while there are none,
#      docs/architecture/schema.sql (retired once roadmap task M1.5 lands)
#   3. supabase/seed.sql
# and print a one-line summary. Stops at the first SQL error.
#
# Needs a Postgres superuser connection, set the usual way (PGHOST, PGPORT,
# PGUSER, PGPASSWORD; see README.md). Environment variables:
#   LITE_DB        database to recreate (default movie_swipe_lite)
#   LITE_ADMIN_DB  database to connect to for dropping and creating (default postgres)

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
db="${LITE_DB:-movie_swipe_lite}"
admin_db="${LITE_ADMIN_DB:-postgres}"

if [[ ! "$db" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "load.sh: LITE_DB must be lower case letters, digits and underscores, got '$db'" >&2
  exit 1
fi

# Warnings and errors only: "already exists, skipping" notices are noise.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

admin() { psql -X -q -v ON_ERROR_STOP=1 -d "$admin_db" "$@"; }
lite() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
# Query results (such as the 7 rows of `select pgmq.create(...)`) are noise; errors still show.
run_file() { lite -o /dev/null -f "$1"; }

if [[ "$(admin -Atc "select rolsuper from pg_roles where rolname = current_user" 2>/dev/null || true)" != "t" ]]; then
  echo "load.sh: cannot connect to Postgres as a superuser (database '$admin_db')." >&2
  echo "         Start the cluster (pg_ctlcluster 16 main start, or systemctl start postgresql) and give" >&2
  echo "         your login a superuser role: sudo -u postgres createuser --superuser \"\$(whoami)\"" >&2
  echo "         More in supabase/lite/README.md" >&2
  exit 1
fi

# Roles belong to the whole cluster and outlive databases. schema.sql creates
# app_server only if it's missing, so the role from the previous load is dropped
# when nothing else uses it, and kept while another lite database still does.
admin -c "drop database if exists $db with (force)"
admin -c "drop role if exists app_server" >/dev/null 2>&1 || true
admin -c "create database $db"

echo "load.sh: stand-ins" >&2
run_file "$here/standins.sql"

shopt -s nullglob
migrations=("$repo"/supabase/migrations/*.sql)
if ((${#migrations[@]} > 0)); then
  source_label="${#migrations[@]} migration(s)"
  for f in "${migrations[@]}"; do # the glob expands in sorted order
    echo "load.sh: ${f#"$repo"/}" >&2
    run_file "$f"
  done
else
  source_label="docs/architecture/schema.sql"
  echo "load.sh: no migrations yet, loading $source_label" >&2
  run_file "$repo/docs/architecture/schema.sql"
fi

echo "load.sh: supabase/seed.sql" >&2
run_file "$repo/supabase/seed.sql"

summary="$(lite -Atc "
  with
  objs as (
    select n.nspname as s, c.relkind as k
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'api', 'internal', 'rec')
  ),
  fns as (
    select n.nspname as s
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'api', 'internal', 'rec')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  )
  select format(
    'tables public=%s rec=%s; views public=%s api=%s; functions api=%s internal=%s rec=%s; queues=%s',
    (select count(*) from objs where s = 'public' and k in ('r', 'p')),
    (select count(*) from objs where s = 'rec' and k in ('r', 'p')),
    (select count(*) from objs where s = 'public' and k = 'v'),
    (select count(*) from objs where s = 'api' and k = 'v'),
    (select count(*) from fns where s = 'api'),
    (select count(*) from fns where s = 'internal'),
    (select count(*) from fns where s = 'rec'),
    (select count(*) from pgmq.meta))
")"

echo "$db loaded from $source_label: $summary"
