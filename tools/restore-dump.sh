#!/usr/bin/env bash
# Restore a logical dump (roadmap M9.6, docs/architecture/operations.md#backups-and-restore).
#   tools/restore-dump.sh <dump folder> <target database URL> [--identity <age key file>] [--i-mean-it]
# The folder holds roles, schema and data as .sql, or as .sql.age (then --identity is needed).
# Order: roles, schema, data (with session_replication_role = replica). Stops on the first error.
# The target must be an empty database. A *.supabase.co or pooler host is refused unless
# --i-mean-it is passed. The URL is never printed.
set -euo pipefail

usage() {
  echo "usage: restore-dump.sh <dump folder> <target database URL> [--identity <age key file>] [--i-mean-it]" >&2
  exit 2
}

[ $# -ge 2 ] || usage
folder=$1
url=$2
shift 2
identity=''
mean_it=0
while [ $# -gt 0 ]; do
  case $1 in
    --identity) [ $# -ge 2 ] || usage; identity=$2; shift 2 ;;
    --i-mean-it) mean_it=1; shift ;;
    *) usage ;;
  esac
done

[ -d "$folder" ] || { echo "restore-dump: dump folder '$folder' does not exist" >&2; exit 1; }

# Each part is plain .sql or encrypted .sql.age.
part() {
  if [ -f "$folder/$1.sql" ]; then echo "$folder/$1.sql"
  elif [ -f "$folder/$1.sql.age" ]; then echo "$folder/$1.sql.age"
  else echo "restore-dump: $folder has no $1.sql or $1.sql.age" >&2; exit 1
  fi
}
roles=$(part roles)
schema=$(part schema)
data=$(part data)

# The host, lowercased, without credentials, port or query.
host=${url#*://}
host=${host#*@}
host=${host%%[/:?]*}
host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
case $host in
  *.supabase.co | *.supabase.com | *.pooler.supabase.com)
    if [ "$mean_it" -ne 1 ]; then
      echo "restore-dump: refusing a Supabase host without --i-mean-it (the drill on Supabase is deliberate)" >&2
      exit 1
    fi ;;
esac

command -v psql > /dev/null || { echo "restore-dump: psql is not installed" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
plain() {
  # Print the plain SQL path for a part, decrypting into the temp folder if needed.
  case $1 in
    *.age)
      [ -n "$identity" ] || { echo "restore-dump: $1 is encrypted, pass --identity <age key file>" >&2; exit 1; }
      command -v age > /dev/null || { echo "restore-dump: age is not installed" >&2; exit 1; }
      out="$work/$(basename "${1%.age}")"
      age --decrypt --identity "$identity" --output "$out" "$1"
      echo "$out" ;;
    *) echo "$1" ;;
  esac
}
roles=$(plain "$roles")
schema=$(plain "$schema")
data=$(plain "$data")

q() { psql "$url" --no-psqlrc --quiet --set ON_ERROR_STOP=1 "$@"; }

echo "restore-dump: roles"
q --file "$roles" > /dev/null
echo "restore-dump: schema"
q --single-transaction --file "$schema" > /dev/null
echo "restore-dump: data"
q --single-transaction --command 'set session_replication_role = replica' --file "$data" > /dev/null

echo "restore-dump: row counts"
tables='auth.users public.profiles public.rooms public.room_members public.room_cards public.votes
public.matches public.rounds public.titles public.user_titles public.swipe_log public.consents
public.app_config public.genres public.providers rec.requests rec.models internal.name_blocklist'
for t in $tables; do
  n=$(q --tuples-only --no-align --command "select count(*) from $t")
  printf '  %-26s %s\n' "$t" "$n"
done
