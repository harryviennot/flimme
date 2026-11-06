#!/usr/bin/env bash
# Captures the six store scenes in both languages on an iPhone simulator, then frames them
# (docs/store/screenshots.md). Dev builds only: the scenes are dev-only routes on fixture data.
#
#   Metro running:   pnpm --filter mobile start --port 8096   (dev client installed on the simulator)
#   Run (mobile/):   scripts/store-shots.sh <simulator udid> [metro port, default 8096]
#
# The simulator must be an iPhone with a 1206 x 2622 screen (iPhone 17 or 17 Pro), set to the
# France region. The status bar is set to 9:41, full battery. The dev menu's button stays off
# through the launch URL (`__expo_disable_fab`). Raw captures go to a temp folder; only the framed
# PNGs are kept, under docs/store/screenshots/.
set -euo pipefail

UDID="${1:?usage: store-shots.sh <simulator udid> [metro port]}"
PORT="${2:-8096}"
APP="com.harryviennot.flimme.dev"
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$(mktemp -d "${TMPDIR:-/tmp}/flimme-store-raw.XXXXXX")"

# scene:seconds to wait for its motion to settle
SCENES=(swipe:4 match:6 lobby:4 card-back:4 final-cut:5 recap:4)

xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --wifiBars 3 --cellularBars 4

xcrun simctl terminate "$UDID" "$APP" 2>/dev/null || true
xcrun simctl openurl "$UDID" \
  "flimme-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${PORT}&__expo_disable_fab=1&__expo_disable_auto_launch=1"
sleep 30

n=0
for entry in "${SCENES[@]}"; do
  n=$((n + 1))
  scene="${entry%%:*}"
  wait="${entry##*:}"
  for lang in fr en; do
    xcrun simctl openurl "$UDID" "flimme-dev:///dev/store/${scene}?lang=${lang}"
    sleep "$wait"
    mkdir -p "$RAW/$lang"
    xcrun simctl io "$UDID" screenshot "$RAW/$lang/$(printf '%02d' "$n")-${scene}.png"
  done
done

xcrun simctl status_bar "$UDID" clear
swift "$HERE/frame-screenshots.swift" "$RAW" "$HERE/../../docs/store"
echo "Raw captures: $RAW"
