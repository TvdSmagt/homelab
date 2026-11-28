# Health monitor

`sensor.home_health` lists what is wrong; the **Status** slide of the [Nest Hub](nest-display.md) shows it.
Checks: [`health.jinja`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/custom_templates/health.jinja),
sensors: [`health_monitor.yaml`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/packages/health_monitor.yaml).

- **Problem** (red): Status button with a red count, joins the rotation, comes to the front once.
- **Note** (grey): listed only. Low batteries are notes: switches last weeks at a few percent.

<div data-xp="heating"></div>

<div data-xp="battery"></div>

Also problems: **Tado onbereikbaar** (all Tado climate entities unavailable 10 min) and **Hue Bridge onbereikbaar**
(all lamps). Also a note: a single **lamp unreachable** for 30 min (wall switch off). Timers use `last_changed`, which
a restart resets.

## Battery types

| Device | Model | Battery |
|---|---|---|
| Hue dimmer v1 / wall module | RWL020/021, RDM001 | CR2450 |
| Hue dimmer v2 / tap dial / button | RWL022, RDM002/003, ROM001 | CR2032 |
| Hue motion sensor | SML00x | 2× AAA |
| Tado valve | VA01/02 | 2× AA alkaline |
| Tado thermostat | RU01/02 | 3× AAA alkaline |

New models: the `cells` maps in `health.jinja`. Rename Tado devices in HA (the Tado app shows which serial is where)
and the slide uses that name.

**Add a check:** append to `ns.w` (problem) or `ns.i` (note) in `health.jinja`, test via `/api/template`, then
`homeassistant.reload_custom_templates` and `template.reload`.
