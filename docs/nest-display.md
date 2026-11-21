# Nest Hub home screen

An ambient dashboard for the Nest Hub in the dining room (`media_player.eetkamer_display`, 1024x600, touch).

- Dashboard: [`homeassistant/dashboards/nest_hub.yaml`](../homeassistant/dashboards/nest_hub.yaml), *Nest Hub* in the
  sidebar, `http://192.168.2.26:8123/nest-hub/thuis`. Registered under `lovelace: dashboards:` in `configuration.yaml`.
- Helpers and the cast automation: [`homeassistant/packages/nest_display.yaml`](../homeassistant/packages/nest_display.yaml).

The cast view (`thuis`) is one full-screen custom element with its own design, no HA cards:
[`homeassistant/www/homelab-ambient-panel.js`](../homeassistant/www/homelab-ambient-panel.js). It is drawn at
1024x600 and scaled to fit other screens. In a normal browser it sits under the HA header; add `?kiosk` to the URL
to make it full screen (on the Nest it always is).

| Part | Shows |
|---|---|
| Background | Live sky: colour follows the real sun elevation (computed from the home location), a glow where the sun is, stars at night, drifting clouds by weather condition, falling rain when the radar says it rains now. Dimmed a bit after 21:00 |
| Left | Clock and date, weather now (animated icon, actual moon phase at night, wind in Bft, humidity), day arc with sunrise / sunset, rain next 2 hours (Buienradar, from KNMI radar; tap for details), solar harvest today vs forecast and tomorrow's forecast |
| Centre | Energy: status line ("We leveren terug", "Stroom van het net"), energy score (tap for the breakdown), animated solar / grid / house flow with usage now, thin 12 h graph of solar vs house power, today's totals |
| Right | All Tado rooms: current and target temperature with - / +, heating glow, hot water; lights (tap toggles); scenes Relax / Gedimd / Fel / Uit |

Entities, rooms, lights and scenes are defaults in the top of the JS file and can be overridden per key in the
card config. The earlier version built from HA cards is kept as view `kaarten` (`/nest-hub/kaarten`).

The - / + buttons collect presses for 2 s and send one `climate.set_temperature` per room (Tado limits API calls per day).

It is interactive on the Nest Hub: taps go to Home Assistant as on any dashboard. There is no keyboard.
"Hey Google", timers and other media replace the cast; the automation puts it back every 5 minutes between
07:00 and 22:30 when nothing else is playing; at 22:30 a second automation stops it.

**"Not connected" every now and then:** a pychromecast bug. After a network blip HA reconnects to the Nest
and then waits, inside its own socket thread, for an answer that only this thread can read. The wait times
out, HA connects again, and this repeats every 30 s. Each time the receiver logs in again and briefly shows
"Not connected"; the log fills with `_connect_hass failed`. The automation *Nest Hub - fix cast reconnect
loop* catches that warning (via `system_log: fire_event`), reloads the cast integration and casts once more.

### Files

- [`homelab-ambient-panel.js`](../homeassistant/www/homelab-ambient-panel.js): the full-screen panel (`custom:homelab-ambient-panel`).
- [`homelab-energy-card.js`](../homeassistant/www/homelab-energy-card.js): the separate cards of the `kaarten` view
  (`homelab-energy-flow-card`, `homelab-climate-card`, `homelab-rain-card`).

No dependencies (the font, Outfit, comes from Google Fonts, with Roboto as fallback). `homeassistant/www` is mounted
at `/config/www` and the files are loaded as `/local/<file>?v=N` (`lovelace: resource_mode: yaml` + `resources:` in
`configuration.yaml`). **Bump `?v=` after changing a file**, otherwise the Nest keeps the cached copy. A new
resource needs a Home Assistant restart. To get a new version on the Nest right away: quit the cast app, then cast
again (script below) or wait for the 5-minute automation.

### Burn-in

The Nest Hub has an LCD, so burn-in is unlikely; at most temporary image retention after many static hours.
The screen is off from 22:30 to 07:00, and the layout shifts by up to 5 px every 5 minutes in a slow loop (only on
the Cast receiver, detected by `cast.home-assistant.io` / `CrKey`, or with `?kiosk`). The clock, sky and animations
change all the time anyway.

### Energy score (0-100, per day)

Average of two parts (price timing alone on days without solar):
- **Eigen zon benut** (self consumption): share of today's solar used in the house instead of exported.
- **Slim getimed** (price timing): average dynamic price paid for grid import today vs the average of today's hours
  so far. 50 = average, 100 = everything at the cheapest hour, 0 = far above average.

Shown as a leaf badge in the energy part; tap it for the two parts. Daily counters are `utility_meter`s in the package;
they started 2026-11-21, so that day is partial.

### Start it yourself

Script **Nest Hub: toon dashboard** (`script.nest_hub_show_dashboard`) casts it immediately, e.g. from a
Home Assistant Companion app widget on the phone.

## Requirement: HTTPS

Home Assistant Cast loads the dashboard from an `https://` receiver page, so Home Assistant must be reachable
over HTTPS with a valid certificate (not a self-signed one). Until then `cast.show_lovelace_view` fails with
*"requires your instance to be reachable via HTTPS"* and the automation is off (`initial_state: false`).

Options:
1. **Home Assistant Cloud** (Nabu Casa, paid): sign in under *Settings → Home Assistant Cloud*. Also gives remote access.
2. **DuckDNS + Let's Encrypt** (free, chosen): Caddy reverse proxy on the Pi, see [https.md](https.md).

Then remove `initial_state: false`, restart, and enable the automation once (*Settings → Automations*).
Manual test: *Developer tools → Actions → `cast.show_lovelace_view`* with `dashboard_path: nest-hub`, `view_path: thuis`.
