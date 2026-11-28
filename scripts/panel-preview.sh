#!/usr/bin/env bash
# Screenshots (1024 x 600, the Nest Hub) of the panel in homeassistant/www/homelab-ambient-panel.js with the mock
# data of scripts/panel-preview/index.html, without Home Assistant. Needs Chromium.
#
#   scripts/panel-preview.sh                    all slides
#   scripts/panel-preview.sh energie verleden   only these
#
# PNGs land in $OUT (default /tmp/panel-preview). To click around instead, open
# scripts/panel-preview/index.html#energie in a browser.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
page="$here/panel-preview/index.html"
out=${OUT:-/tmp/panel-preview}
browser=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -n "$browser" ] || { echo "Chromium not found (sudo apt install chromium)" >&2; exit 1; }

if [ $# -gt 0 ]; then slides=("$@"); else slides=(nu energie vandaag verleden weer klimaat lampen status); fi
mkdir -p "$out"
for s in "${slides[@]}"; do
  profile=$(mktemp -d)
  timeout 180 "$browser" --headless --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$profile" \
    --window-size=1024,600 --virtual-time-budget=3000 --screenshot="$out/$s.png" "file://$page#$s" >/dev/null 2>&1 || true
  rm -rf "$profile"
  if [ -s "$out/$s.png" ]; then echo "$out/$s.png"; else echo "failed: $s" >&2; fi
done
