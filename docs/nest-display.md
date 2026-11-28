# Nest Hub home screen

The Nest Hub in the dining room (`media_player.eetkamer_display`, 1024×600, touch) shows one full-screen custom
element: [`homelab-ambient-panel.js`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/www/homelab-ambient-panel.js),
view `/nest-hub/thuis` of [`dashboards/nest_hub.yaml`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/dashboards/nest_hub.yaml)
(`?kiosk` for full screen in a browser). Helpers and automations: `packages/nest_display.yaml`.

A looping carousel: next slide every 60 s, paused 90 s after a touch, swipe to step. Buttons carry live badges.
Screenshots below use the preview's mock data (icons show as blocks).

<div data-xp="slides"></div>

Card options in the dashboard YAML: `rotate`, `resume_after`, `rotate_slides`, `start`; entities, rooms and lights
default at the top of the JS and can be overridden per key. The older card version is view `kaarten`.

<div data-xp="cast"></div>

*Not connected* now and then is a pychromecast reconnect loop after a network blip; the automation *Nest Hub - fix
cast reconnect loop* catches the log warning, reloads Cast and casts again. Cast needs HTTPS with a valid
certificate ([HTTPS](https.md)).

## Energy score

<div data-xp="score"></div>

Computed in the panel over a rolling 24 h from the 5-minute statistics, per hour for the Vandaag graph; needs 12 hours
of data. Until those load it shows `sensor.energy_score_today` (from midnight). Prices: the dynamic all-in price
([Smart meter](smart-meter.md)); after 18:00 the price graph shows 18:00 until 18:00 tomorrow.

## Notes

- **Power** is net over the three phases (import − export), like `sensor.house_power`.
- **Gas** graphs come from hourly statistics; the meter reports hourly, so today uses `sensor.gas_today`.
- **Tado − / +** presses are collected for 2 s and sent as one call (API limit).
- **Burn-in:** LCD, screen off at night, layout shifts up to 5 px every 5 minutes.

## Change and deploy

```sh
scripts/panel-preview.sh            # screenshots of all slides from mock data, no HA needed
scripts/deploy-panel.sh             # bump ?v=, reload resources, restart the dashboard on the Nest
```

New entities in the panel go into the mock (`scripts/panel-preview/index.html`) too. Script *Nest Hub: toon
dashboard* casts now (phone widget); *Nest Hub: herstart dashboard* reloads it.
