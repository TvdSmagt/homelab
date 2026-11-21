# Nest Hub home screen

An ambient dashboard for the Nest Hub in the dining room (`media_player.eetkamer_display`, 1024x600, touch).

- Dashboard: [`homeassistant/dashboards/nest_hub.yaml`](../homeassistant/dashboards/nest_hub.yaml), *Nest Hub* in the
  sidebar, `http://192.168.2.26:8123/nest-hub/thuis`. Registered under `lovelace: dashboards:` in `configuration.yaml`.
- Helpers and the cast automation: [`homeassistant/packages/nest_display.yaml`](../homeassistant/packages/nest_display.yaml).

| Column | Shows |
|---|---|
| 1 | Clock, hourly weather (Met), outdoor temperature (Tado), sunset |
| 2 | Live solar / house / grid power; today's dynamic price as a bar line with the current hour and the cheapest 3-hour slot; today's grid import, solar (actual and forecast), gas, cost fixed vs dynamic |
| 3 | Tado zones (living room with +/-), hot water, downstairs lights (tap toggles), scenes Relax / Gedimd / Fel / Uit |

It is interactive on the Nest Hub: taps go to Home Assistant as on any dashboard. There is no keyboard.
"Hey Google", timers and other media replace the cast; the automation puts it back every 5 minutes between
06:30 and 23:00 when nothing else is playing.

## Requirement: HTTPS

Home Assistant Cast loads the dashboard from an `https://` receiver page, so Home Assistant must be reachable
over HTTPS with a valid certificate (not a self-signed one). Until then `cast.show_lovelace_view` fails with
*"requires your instance to be reachable via HTTPS"* and the automation is off (`initial_state: false`).

Options:
1. **Home Assistant Cloud** (Nabu Casa, paid): sign in under *Settings → Home Assistant Cloud*. Also gives remote access.
2. **DuckDNS + Let's Encrypt** (free, chosen): Caddy reverse proxy on the Pi, see [https.md](https.md).

Then remove `initial_state: false`, restart, and enable the automation once (*Settings → Automations*).
Manual test: *Developer tools → Actions → `cast.show_lovelace_view`* with `dashboard_path: nest-hub`, `view_path: thuis`.
