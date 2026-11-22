# Nest Hub home screen

An ambient dashboard for the Nest Hub in the dining room (`media_player.eetkamer_display`, 1024x600, touch).

- Dashboard: [`homeassistant/dashboards/nest_hub.yaml`](../homeassistant/dashboards/nest_hub.yaml), *Nest Hub* in the
  sidebar, `http://192.168.2.26:8123/nest-hub/thuis`. Registered under `lovelace: dashboards:` in `configuration.yaml`.
- Helpers and the cast automation: [`homeassistant/packages/nest_display.yaml`](../homeassistant/packages/nest_display.yaml).

The cast view (`thuis`) is one full-screen custom element with its own design, no HA cards:
[`homeassistant/www/homelab-ambient-panel.js`](../homeassistant/www/homelab-ambient-panel.js). It is drawn at
1024x600 and scaled to fit other screens. In a normal browser it sits under the HA header; add `?kiosk` to the URL
to make it full screen (on the Nest it always is).

It is a looping carousel of full-screen slides, one subject per slide in large type so it reads from across the
room. The bar at the bottom shows the time and has a button per slide; swipe left / right to step through the loop.
It advances on its own every 20 s (a line under the active button counts down) and pauses for 90 s after any touch.
The buttons carry live badges: energy state colour, a blue dot when rain is coming, the number of rooms heating and
of lights on.

| Slide | Shows |
|---|---|
| Background | Live sky: colour follows the real sun elevation (computed from the home location), a glow where the sun is, stars at night, drifting clouds by weather condition, falling rain when the radar says it rains now. Dimmed a bit after 21:00 |
| Nu | Big clock and date, weather now (animated icon, actual moon phase at night, wind in Bft, humidity), day arc with sunrise / sunset; tiles for rain next 2 hours, solar today vs forecast, and the energy score of the last 24 hours with a graph of that score over the last day (tap a tile to open its slide) |
| Energie | Status line ("We leveren terug", "Stroom van het net"), animated solar / grid / house flow with usage now, energy score of the last 24 hours with its two parts, dynamic electricity price per hour from 07:00 to 07:00 (green cheap to red expensive, past hours dimmed, current hour outlined) with the cheapest 3-hour block from now on marked *vaatwasser* |
| Vandaag | 12 h graph of solar vs house power, today's totals (usage, import, export, gas, self consumption, cost) |
| Regen | Rain next 2 hours (Buienradar, from KNMI radar). Skipped by the auto-rotation when it stays dry |
| Klimaat | All Tado rooms: current and target temperature with big - / +, heating glow, outdoor temperature, hot water; gas use today (with cost at the fixed contract price), per hour for the last 24 h and per day for the last 7 days |
| Lampen | Lights (tap toggles) and scenes Relax / Gedimd / Fel / Uit. Not in the auto-rotation |

Carousel options in the card config: `rotate` (seconds per slide, 0 = off), `resume_after` (seconds after a touch),
`rotate_slides` (which slides the auto-rotation visits), `start` (first slide).

**Phases:** the P1 power values (`power_consumption` / `power_production`) are summed per direction over the three
phases, so one phase can import while another exports and both are non-zero at once. The meter registers (what the
supplier bills, and what the daily counters and the energy score use) net the phases. The panel therefore shows the
net flow: import minus export. `sensor.house_power` already does the same.

The price graph uses the EnergyZero market prices (`sensor.energyzero_electricity_prices`, yesterday to tomorrow)
with the same all-in formula as `sensor.dynamic_electricity_price`: (market + 0.020) x 1.21 + 0.11085 per kWh
(`price_markup`, `price_vat`, `price_tax` in the card config). Tomorrow's prices are published around 13:00, so in the
morning the night hours are still empty. `price_day_start` and `cheap_hours` set the window and the block length.

The gas graphs come from the recorder's long-term statistics of `sensor.gas_meter_gas_consumption` (hourly and daily
`change`), reloaded every 15 minutes. The P1 gas meter reports about once an hour, so the newest hour can lag; today's
bar uses the live `sensor.gas_today` counter instead.

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

### Energy score (0-100, last 24 hours)

Average of two parts (price timing alone when there was less than 0.1 kWh of solar):
- **Eigen zon zelf gebruikt** (self consumption): share of the solar used in the house instead of exported.
- **Slim getimed** (price timing): average dynamic price paid for grid import vs the average of the hour prices in the
  window. 50 = average, 100 = everything at the cheapest hour, 0 = far above average.

The panel computes it over a rolling 24 hours from the recorder's 5-minute statistics of the solar, import and export
totals and `sensor.dynamic_contract_import_cost`, bucketed per hour (prices from the EnergyZero list, older hours from
the statistics of `sensor.dynamic_electricity_price`), every 5 minutes. It does the same for each of the last 24 hours
for the graph on the Nu slide. Until those statistics load it shows the HA sensors, which count from midnight:
`sensor.energy_score_today`, `sensor.self_consumption_today`, `sensor.price_timing_score_today` (package
`nest_display.yaml`, also used by the `kaarten` view). Statistics start 2026-11-21 17:00, so the first graph is short.

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
