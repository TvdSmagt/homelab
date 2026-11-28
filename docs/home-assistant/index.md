# Home Assistant setup

Home Assistant **Container** (`:stable`), so no add-ons: Mosquitto, OTBR, Matter and Caddy are their own containers.
Host network (discovery, IPv6), P1 cable as `/dev/ttyUSB0`.

| In the container | From | |
|---|---|---|
| `/config` | `data/homeassistant/` | UI state: integrations, `.storage`, database, `configuration.yaml`. **Not in git** |
| `/config/packages` | `homeassistant/packages/` | read-only, [one file per feature](packages.md) |
| `/config/custom_templates` | `homeassistant/custom_templates/` | read-only, Jinja macros |
| `/config/dashboards` | `homeassistant/dashboards/` | read-only, YAML dashboards |
| `/config/www` | `homeassistant/www/` | read-only, custom cards at `/local/` |

Logic lives in git, connections to devices and accounts in the UI.

<div data-xp="config"></div>

`call` is a small helper around the REST API (needs `HA_TOKEN` in `.env`):

```sh
set -a; . ./.env; set +a
call() { curl -fsS -X POST -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
           -d "${2:-{\}}" "http://localhost:8123/api/services/$1"; }
# try a template on live data first:
curl -s -H "Authorization: Bearer $HA_TOKEN" -X POST localhost:8123/api/template -d '{"template":"{{ states(\"sensor.home_health\") }}"}'
```

## Entity ids

Packages use entity ids directly; they come from the names in the integrations.

<div data-xp="naming"></div>

Tado zones: **Woonkamer**, **Beneden**, **Bibliotheek**, **Kleine kamer**. Tado devices are named by serial
(`binary_sensor.va…_battery`), the Growatt inverter by its serial (`sensor.6fz463602f_*`).

## History

The recorder keeps raw states **10 days**; sensors with a `state_class` also get hourly statistics **forever**. The
Verleden slide, gas graphs and the airco-vs-gas comparison read those statistics.
