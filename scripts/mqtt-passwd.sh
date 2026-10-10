#!/usr/bin/env bash
# (Re)creates the Mosquitto password file from MQTT_USER / MQTT_PASSWORD in .env.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
mkdir -p data/mosquitto

docker compose run --rm --no-deps mosquitto \
  mosquitto_passwd -b -c /mosquitto/data/passwd "$MQTT_USER" "$MQTT_PASSWORD"
docker compose run --rm --no-deps --entrypoint "" mosquitto \
  sh -c 'chown mosquitto:mosquitto /mosquitto/data/passwd && chmod 0700 /mosquitto/data/passwd'

if docker compose ps --status running --services | grep -qx mosquitto; then
  docker compose restart mosquitto
fi
echo "Mosquitto user '$MQTT_USER' configured."
