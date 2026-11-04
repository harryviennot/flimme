#!/usr/bin/env bash
# A curl guest for the touch runs: it joins a room, answers its cards and sends a Final Cut
# ballot, so one simulator can play a whole room (the Final Cut flows, final-cut.yaml).
#
#   guest-answers.sh join <room code>             joins and touches the room; saves the guest
#   guest-answers.sh answers <room id> <count> <like|nope|seen>
#                                                 answers <count> cards with that answer
#   guest-answers.sh ballot <room id> [veto]      locks in the seed order; with `veto`, vetoes the last
#                                                 finalist (the seed order minus that film)
#   guest-answers.sh touch <room id>              keeps the room fresh (run it in a loop)
#
# Environment: the backend is staging by default, through EXPO_PUBLIC_STAGING_SUPABASE_URL and
# EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY (the same two values Metro gets, see the task
# skill, step 7). GUEST_STATE (default /tmp/flimme-guest.json) keeps the guest's token between
# calls, so `join`, `answers` and `ballot` are the same player. Nothing here is a secret: the
# key is the public one, and the token is a throwaway guest account.
set -euo pipefail

: "${EXPO_PUBLIC_STAGING_SUPABASE_URL:?set EXPO_PUBLIC_STAGING_SUPABASE_URL}"
: "${EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY:?set EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY}"
export GUEST_STATE="${GUEST_STATE:-/tmp/flimme-guest.json}"
export GUEST_URL="$EXPO_PUBLIC_STAGING_SUPABASE_URL"
export GUEST_KEY="$EXPO_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY"

exec python3 -I - "$@" <<'PY'
import json, os, sys, urllib.request, urllib.error

URL, KEY, STATE = os.environ["GUEST_URL"], os.environ["GUEST_KEY"], os.environ["GUEST_STATE"]


def call(path, body=None, token=None, profile="api"):
    headers = {"apikey": KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    headers["Content-Profile" if body is not None else "Accept-Profile"] = profile
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(URL + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        return {"http": error.code, "body": error.read().decode()[:300]}


def rpc(token, fn, body):
    return call("/rest/v1/rpc/" + fn, body, token)


def token():
    if os.path.exists(STATE):
        return json.load(open(STATE))["token"]
    fresh = call("/auth/v1/signup", {})["access_token"]
    rpc(fresh, "update_profile", {"p_display_name": "Guest", "p_country": "FR", "p_avatar_key": "teal"})
    json.dump({"token": fresh}, open(STATE, "w"))
    return fresh


mode = sys.argv[1] if len(sys.argv) > 1 else ""
t = token()

if mode == "join":
    out = rpc(t, "join_room", {"p_code": sys.argv[2]})
    print(json.dumps(out))
    if out.get("room_id"):
        print(rpc(t, "touch_room", {"p_room_id": out["room_id"]}))
elif mode == "touch":
    rpc(t, "touch_room", {"p_room_id": sys.argv[2]})
elif mode == "answers":
    room, count, answer = sys.argv[2], int(sys.argv[3]), sys.argv[4]
    sent = 0
    while sent < count:
        cards = rpc(t, "my_next_cards", {"p_room_id": room, "p_limit": min(30, count - sent)})
        if not isinstance(cards, list) or not cards:
            print("no more cards:", cards)
            break
        for card in cards:
            if sent >= count:
                break
            result = rpc(t, "cast_vote", {"p_room_id": room, "p_title_id": card["title_id"], "p_answer": answer})
            if result.get("status") not in ("ok", "duplicate"):
                print("stopped:", result)
                sent = count
                break
            sent += 1
    print("answered", sent)
elif mode == "ballot":
    room = sys.argv[2]
    rounds = call("/rest/v1/rounds?room_id=eq.%s&stage=neq.closed&select=id&order=seq.desc&limit=1" % room, None, t)
    round_id = rounds[0]["id"]
    rows = call("/rest/v1/round_candidates?round_id=eq.%s&select=title_id,seed&order=seed" % round_id, None, t)
    order = [row["title_id"] for row in rows]
    body = {"p_round_id": round_id, "p_ranking": order}
    if len(sys.argv) > 3 and sys.argv[3] == "veto":
        body = {"p_round_id": round_id, "p_ranking": order[:-1], "p_veto": order[-1]}
    print(json.dumps(rpc(t, "cast_ballot", body)))
else:
    sys.exit(__doc__ or "usage: guest-answers.sh join|answers|ballot|touch ...")
PY
