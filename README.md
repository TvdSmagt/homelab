# homelab

Home management stack for `home-pi` (Raspberry Pi, Debian 13, arm64), run with Docker Compose.

| Service | Purpose | Port |
|---|---|---|
| `mosquitto` | MQTT broker | 1883 |
| `grott` | Growatt datalogger proxy → MQTT (+ Home Assistant auto-discovery) | 5279 |
| `homeassistant` | Home Assistant (host network), P1 smart meter cable on `/dev/ttyUSB0` | 8123 |
| `otbr` | OpenThread Border Router on the ZBT-2 (host network) | 8081 (REST), 8083 (web) |
| `matter-server` | Matter server for Home Assistant (host network) | 5580 |

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

The ShineLAN logger (`192.168.2.18`) must send its data to this Pi (`192.168.2.26`, eth0) instead of
`server.growatt.com`. Change its server address in its own web UI; Grott forwards everything to Growatt,
so the Zelfstroom / Growatt portal and app keep working.

Device details, exact settings, rollback and setup status: [docs/growatt-datalogger.md](docs/growatt-datalogger.md).

Alternative without touching the logger: resolve `server.growatt.com` to `192.168.2.26` in DNS.
In that case set `ip = 47.91.67.66` (the real Growatt IP) under `[Growatt]` in `grott/grott.ini`, otherwise Grott loops.

## Home Assistant

1. Open `http://192.168.2.26:8123` and complete onboarding.
2. *Settings → Devices & services → Add integration → MQTT*: broker `localhost`, port `1883`,
   with `MQTT_USER` / `MQTT_PASSWORD` from `.env` (`grep MQTT .env`). `localhost` works because
   Home Assistant uses host networking and Mosquitto publishes port 1883 on the host.
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

## Backup

`data/matter-server` (Matter fabric) and `data/otbr` (Thread network key) cannot be recreated: losing them means
re-pairing every Matter device. Home Assistant's own backups (*Settings → System → Backups*) only cover `/config`,
not these. Some files are root-only (written by containers running as root), so `tar` needs `sudo`; Home Assistant
is stopped as well because its database is written continuously.

```sh
cd ~/git/homelab
docker compose stop homeassistant matter-server otbr
sudo tar czf ~/homelab-backup-$(date +%F).tar.gz data/matter-server data/otbr data/homeassistant .env
sudo chown $USER: ~/homelab-backup-$(date +%F).tar.gz
docker compose start otbr matter-server homeassistant
tar tzf ~/homelab-backup-$(date +%F).tar.gz | grep -c otbr   # > 0, and no "Permission denied" above
```

Copy the archive off the Pi (an SD card failure takes local backups with it).

## Resources

The Pi has 1.8 GB RAM plus zram swap. The stack uses roughly: Home Assistant ~450 MB, Matter server ~150 MB,
the rest small; each Matter device adds a few MB. A VS Code remote session adds ~1 GB and the desktop ~300 MB;
if the Pi runs without a screen, `sudo raspi-config` → System → Boot → Console frees the latter.

## Layout

```
compose.yaml          all services
.env                  secrets (not committed; copy from .env.example)
mosquitto/            broker config
grott/                grott config + HA extension
homeassistant/        HA packages, jinja macros, YAML dashboards (mounted into the container)
scripts/              helper scripts
docs/                 device notes (smart-meter.md, matter-thread.md, ...) and roadmap.md
data/                 runtime state (not committed)
```
