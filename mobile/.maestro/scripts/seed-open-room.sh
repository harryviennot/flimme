#!/usr/bin/env bash
# Seeds an open room with a fixed code on the local Supabase stack, for the join flows
# (join.yaml, name-from-code.yaml). A guest host signs in, names themselves and opens a room;
# psql (in the database container) then gives the room the code 482913. Run it from anywhere with the stack up:
#   mobile/.maestro/scripts/seed-open-room.sh
# Safe to run again: an older room with that code is closed first.
set -euo pipefail

CODE="${1:-482913}"
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_flimme}"

auth=$(curl -sS -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
  -H 'Content-Type: application/json' -d '{}')
token=$(printf '%s' "$auth" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

rpc() {
  curl -sS -X POST "$API_URL/rest/v1/rpc/$1" -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $token" -H 'Content-Profile: api' \
    -H 'Content-Type: application/json' -d "$2"
}

rpc update_profile '{"p_display_name":"Hote","p_country":"FR"}' >/dev/null
room=$(rpc create_room '{"p_mode":"quick_match","p_country":"FR"}')
room_id=$(printf '%s' "$room" | python3 -c 'import json,sys; print(json.load(sys.stdin)["room_id"])')

# psql runs inside the stack's database container, so nothing needs installing.
docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q <<SQL
update public.rooms set state = 'abandoned' where code = '$CODE' and id <> '$room_id';
update public.rooms set code = '$CODE' where id = '$room_id';
SQL
echo "Open room $room_id has the code $CODE"
