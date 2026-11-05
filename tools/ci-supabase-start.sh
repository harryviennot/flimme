#!/usr/bin/env bash
# Starts the local Supabase stack in CI, up to three tries. The arguments go to `supabase start`.
#   bash tools/ci-supabase-start.sh -x studio,imgproxy
# A failed start can leave containers behind, so each retry first stops the stack (no backup:
# CI's database is thrown away), then waits a little longer: CI_SUPABASE_START_WAIT seconds
# times the try number (20 by default). After a failed try it lists the sockets on the stack's
# ports (54320 to 54329), so a port clash shows its cause in the log.
set -uo pipefail

tries=3
wait_unit=${CI_SUPABASE_START_WAIT:-20}

for try in $(seq 1 "$tries"); do
  if supabase start "$@"; then
    exit 0
  fi
  echo "Sockets on the stack's ports after try $try:"
  ss -tan '( sport >= :54320 and sport <= :54329 )' 2>/dev/null || true
  if [ "$try" -lt "$tries" ]; then
    wait=$((try * wait_unit))
    echo "::warning::supabase start failed (try $try of $tries). Stopping the stack, then retrying in ${wait}s."
    supabase stop --no-backup || true
    sleep "$wait"
  fi
done

echo "::error::supabase start failed $tries times."
exit 1
