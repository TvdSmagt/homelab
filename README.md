# homelab

Home management stack for `home-pi` (Raspberry Pi, Debian 13, arm64), run with Docker Compose.

| Service | Purpose | Port |
|---|---|---|
| `mosquitto` | MQTT broker | 1883 |
| `grott` | Growatt datalogger proxy → MQTT (+ Home Assistant auto-discovery) | 5279 |
| `homeassistant` | Home Assistant (host network) | 8123 |

```
Growatt inverter ── ShineWiFi/LAN ──► grott:5279 ──► server.growatt.com:5279   (ShinePhone keeps working)
                                          │
                                          └──► mosquitto ──► Home Assistant
```

## Setup

1. Install Docker (once):
   ```sh
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER   # log out/in afterwards
   ```
2. Configure secrets and create the MQTT user:
   ```sh
   cp .env.example .env && nano .env
   ./scripts/mqtt-passwd.sh
   ```
3. Start everything:
   ```sh
   docker compose up -d
   docker compose logs -f grott
   ```

## Point the Growatt datalogger at Grott

The datalogger must send its data to this Pi (`192.168.2.26`, eth0) instead of `server.growatt.com`.
Grott forwards everything to Growatt, so the ShinePhone app and growatt.com keep working.

**Option A: via the Growatt server (easiest).** Log in at <https://server.growatt.com> →
*Configuration* → *Datalogger* → select your datalogger → *Setting* → *Advanced setting*:
- set **Server IP / domain** to `192.168.2.26`, password `growattYYYYMMDD` (today's date)
- the datalogger restarts and connects to Grott.

**Option B: datalogger web UI.** Connect to the ShineWiFi's own access point (or its LAN IP),
open `http://192.168.10.100` (default login `admin` / `12345678`), and under *Advanced Settings* set the
server address to `192.168.2.26`, port `5279`.

**Option C: DNS.** Resolve `server.growatt.com` to `192.168.2.26` in your router/DNS.
In that case set `ip = 47.91.67.66` (the real Growatt IP) under `[Growatt]` in `grott/grott.ini`, otherwise Grott loops.

Give the Pi a fixed DHCP lease in the router so the address does not change.

## Home Assistant

1. Open `http://192.168.2.26:8123` and complete onboarding.
2. *Settings → Devices & services → Add integration → MQTT*: broker `localhost`, port `1883`,
   with `MQTT_USER` / `MQTT_PASSWORD` from `.env`.
3. Once the datalogger sends data (every ~5 min), a **Growatt** device appears automatically.
4. Energy dashboard: *Settings → Dashboards → Energy → Add solar production* →
   the inverter's *Generated energy (Total)* sensor.

## Grott

- Configuration: `grott/grott.ini` (secrets via `.env`, see `compose.yaml`).
- Raw data is also published to MQTT topic `energy/growatt`:
  `docker compose exec mosquitto mosquitto_sub -u $MQTT_USER -P $MQTT_PASSWORD -t 'energy/#' -v`
- If values look wrong, set `invtype` in `grott.ini` (e.g. `sph`, `spf`, `max`, `tl3`) and `docker compose restart grott`.
  Set `verbose = True` for debugging.
- `grott/grott_ha.py` is the Home Assistant extension vendored from
  [johanmeijer/grott](https://github.com/johanmeijer/grott/tree/master/examples/Home%20Assistent).

## Layout

```
compose.yaml          all services
.env                  secrets (not committed; copy from .env.example)
mosquitto/            broker config
grott/                grott config + HA extension
scripts/              helper scripts
data/                 runtime state (not committed)
```
