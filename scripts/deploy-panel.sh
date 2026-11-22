#!/usr/bin/env bash
# Deploy a change to the custom cards in homeassistant/www/ (the Nest Hub panel and friends).
#
#   scripts/deploy-panel.sh             bump the ?v= of changed cards, reload them, restart the Nest Hub dashboard
#   scripts/deploy-panel.sh --restart   same, but restart Home Assistant instead of reloading the resources
#
# The cards are served as /local/<name>.js?v=... from the resources in data/homeassistant/configuration.yaml
# (lovelace: resources). Browsers and the Nest Hub cache them, so every change needs a new ?v=. This script sets
# it to a hash of the file, so it only changes when the file does.
#
# With HA_TOKEN in .env (a long-lived access token of an admin user, made under your profile > Security), it then
# calls lovelace.reload_resources and the script "Nest Hub: herstart dashboard" (packages/nest_display.yaml):
# no restart needed. Without a token it restarts Home Assistant and you restart the Nest Hub dashboard yourself.
set -euo pipefail

cd "$(dirname "$0")/.."
restart=false
[ "${1:-}" = "--restart" ] && restart=true
if [ -f .env ]; then set -a; . ./.env; set +a; fi
ha=${HA_URL:-http://localhost:8123}
conf=/config/configuration.yaml   # inside the container; the host copy is owned by root

# 1. ?v= = first 8 characters of the file's sha1, for every card listed as a resource.
changed=()
for f in homeassistant/www/*.js; do
  name=$(basename "$f")
  v=$(sha1sum "$f" | cut -c1-8)
  cur=$(docker exec homeassistant grep -o "/local/$name?v=[^[:space:]]*" "$conf" || true)
  [ -n "$cur" ] || continue                     # not a resource
  [ "$cur" = "/local/$name?v=$v" ] && continue  # unchanged
  docker exec homeassistant sed -i "s|/local/$name?v=[^[:space:]]*|/local/$name?v=$v|" "$conf"
  echo "$name: ${cur#*\?} -> v=$v"
  changed+=("$name")
done
if [ ${#changed[@]} -eq 0 ] && ! $restart; then
  echo "No card changed, nothing to do."
  exit 0
fi

call() {  # call <domain/service> [json]
  local body='{}'
  [ $# -gt 1 ] && body=$2
  curl -fsS -o /dev/null -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
    -d "$body" "$ha/api/services/$1"
}

# 2. Load the new version in Home Assistant.
if [ -n "${HA_TOKEN:-}" ] && ! $restart; then
  call lovelace/reload_resources
  echo "Resources reloaded."
else
  [ -n "${HA_TOKEN:-}" ] || echo "No HA_TOKEN in .env: restarting Home Assistant instead."
  docker exec homeassistant python3 -m homeassistant --script check_config --config /config >/dev/null \
    || { echo "Config check failed, not restarting." >&2; exit 1; }
  docker restart homeassistant >/dev/null
  echo -n "Waiting for Home Assistant"
  for _ in $(seq 60); do
    curl -fs -o /dev/null "$ha/manifest.json" && break
    echo -n .
    sleep 5
  done
  echo " up."
fi

# 3. Reload the dashboard on the Nest Hub (it only fetches the cards when the cast starts).
if [ -n "${HA_TOKEN:-}" ]; then
  if $restart; then sleep 20; fi  # let the integrations (cast) come up after a restart
  call script/turn_on '{"entity_id": "script.nest_hub_restart_dashboard"}'
  echo "Nest Hub dashboard restarted."
else
  echo "Run the script \"Nest Hub: herstart dashboard\" in Home Assistant to load it on the Nest Hub."
fi
