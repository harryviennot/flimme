#!/usr/bin/env bash
# The local restore drill (roadmap M9.6, docs/architecture/operations.md#backups-and-restore).
#   tools/restore-drill.sh
# Builds a throwaway source database (every migration, the seed, one synthetic room), dumps it with
# the Supabase CLI exactly as backup.yml does, encrypts the dump with a throwaway age key, restores
# it with tools/restore-dump.sh into a second empty database, then compares the two.
# Needs docker, psql, age and the Supabase CLI. It never touches the shared local Supabase stack:
# both databases are its own containers (ports 54998 and 54999), removed at the end.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image=public.ecr.aws/supabase/postgres:17.11.0.006 # the version supabase/config.toml runs
src_name=flimme-drill-source
tgt_name=flimme-drill-target
src="postgresql://postgres:drillpw@127.0.0.1:54998/postgres"
tgt="postgresql://postgres:drillpw@127.0.0.1:54999/postgres"
work=$(mktemp -d)

cleanup() {
  docker rm -f "$src_name" "$tgt_name" > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
cleanup_first() { docker rm -f "$src_name" "$tgt_name" > /dev/null 2>&1 || true; }
cleanup_first

started=$(date +%s)
step() { echo "drill: $*"; }
sql() { psql "$1" --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 "${@:2}"; }

wait_ready() {
  for _ in $(seq 1 60); do
    sql "$1" --command 'select 1' > /dev/null 2>&1 && return 0
    sleep 1
  done
  echo "drill: $1 never came up" >&2
  exit 1
}

step "starting two empty databases ($image)"
docker run -d --name "$src_name" -e POSTGRES_PASSWORD=drillpw -p 54998:5432 "$image" > /dev/null
docker run -d --name "$tgt_name" -e POSTGRES_PASSWORD=drillpw -p 54999:5432 "$image" > /dev/null
wait_ready "$src"
wait_ready "$tgt"

# A Supabase project has more than the bare image: two roles, realtime.send, realtime.topic and
# realtime.messages (stubs here), the column auth.users.is_anonymous, and the current auth.uid()
# and auth.jwt() that read request.jwt.claims. Added to both databases.
cat > "$work/project.sql" << 'SQL'
create role supabase_realtime_admin nologin;
create role supabase_functions_admin nologin;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
  returns void language sql as $$ select $$;
create or replace function realtime.topic() returns text language sql stable as $$ select null::text $$;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text, extension text,
  payload jsonb, event text, private boolean default false, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
alter table auth.users add column if not exists is_anonymous boolean not null default false;
SQL
for name in "$src_name" "$tgt_name"; do
  docker exec -i "$name" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 < "$work/project.sql"
done

step "building the source: migrations, seed, one synthetic room"
for f in "$root"/supabase/migrations/*.sql; do
  sql "$src" --single-transaction --file "$f" > /dev/null
done
sql "$src" --file "$root/supabase/seed.sql" > /dev/null
sql "$src" --file "$root/supabase/tests/database/000-helpers.sql" > /dev/null
# The helpers act as a player with set local role, so the room is made in one transaction.
printf 'begin;\nselect tests.create_room(3);\ncommit;\n' > "$work/room.sql"
sql "$src" --file "$work/room.sql" > /dev/null
sql "$src" --command 'drop schema tests cascade' > /dev/null

step "dumping the source (as backup.yml does) and encrypting"
mkdir -p "$work/dump"
supabase db dump --db-url "$src" --role-only -f "$work/plain-roles.sql" > /dev/null 2>&1
supabase db dump --db-url "$src" -f "$work/plain-schema.sql" > /dev/null 2>&1
supabase db dump --db-url "$src" --data-only --use-copy -f "$work/plain-data.sql" > /dev/null 2>&1
grep -q '^COPY "auth"."users"' "$work/plain-data.sql"
grep -q '^COPY "public"."profiles"' "$work/plain-data.sql"
age-keygen -o "$work/key.txt" > /dev/null 2>&1
recipient=$(age-keygen -y "$work/key.txt")
for part in roles schema data; do
  age --recipient "$recipient" --output "$work/dump/$part.sql.age" "$work/plain-$part.sql"
done
rm -f "$work"/plain-*.sql

step "restoring into the empty target"
restore_started=$(date +%s)
"$root/tools/restore-dump.sh" "$work/dump" "$tgt" --identity "$work/key.txt"
restore_took=$(($(date +%s) - restore_started))

step "checking"
fail=0
check() { # check <label> <query>: the same answer on both sides
  local a b
  a=$(sql "$src" --command "$2")
  b=$(sql "$tgt" --command "$2")
  if [ "$a" = "$b" ]; then printf '  ok    %s (%s)\n' "$1" "$a"
  else printf '  FAIL  %s (source %s, target %s)\n' "$1" "$a" "$b"; fail=1; fi
}
check 'auth.users' 'select count(*) from auth.users'
check 'public.profiles' 'select count(*) from public.profiles'
check 'public.rooms' 'select count(*) from public.rooms'
check 'public.room_members' 'select count(*) from public.room_members'
check 'room codes' 'select string_agg(code, $$,$$ order by code) from public.rooms'
check 'public tables' "select count(*) from pg_tables where schemaname in ('public','internal','rec')"
check 'api views' "select count(*) from pg_views where schemaname = 'api'"
check 'api and internal functions' "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('api','internal')"
check 'policies' "select count(*) from pg_policies where schemaname in ('public','internal','rec')"
check 'api.app_config answers' 'select count(*) from api.app_config'
# The dump leaves supabase_migrations out (the CLI excludes it); the runbook says what to do.
echo "  note  the dump leaves supabase_migrations out, so a restored project needs its migration history repaired (see the runbook)"

total=$(($(date +%s) - started))
step "restore took ${restore_took}s, the whole drill ${total}s"
[ "$fail" -eq 0 ] || { echo "drill: FAILED" >&2; exit 1; }
step "passed"
