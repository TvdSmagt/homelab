# Health monitor

What is wrong in the house, on the **Status** slide of the Nest Hub panel ([nest-display.md](nest-display.md)).

- Checks: [`homeassistant/custom_templates/health.jinja`](../homeassistant/custom_templates/health.jinja) (macro `health_items`).
- Sensors: [`homeassistant/packages/health_monitor.yaml`](../homeassistant/packages/health_monitor.yaml).
  `sensor.home_health` = number of problems; attribute `items` = the list (`level`, `icon`, `title`, `detail`,
  `entity`, and `kind: battery` on a percentage battery note), problems first; `info_count` = number of notes.

Two levels:
- **Problem** (`warn`, red): the Status button appears in the bottom bar with a red count, the slide joins the
  rotation, and a new problem brings it to the front once (not while someone is touching the screen).
- **Note** (`info`, quiet): listed on the Status slide with a grey count on its button, not in the rotation.
  Low batteries are notes: Hue switches keep working for weeks at a few percent.

| Check | Level | When |
|---|---|---|
| Room does not warm up | problem | A Tado room's average heating demand over 2 h is >= 50 %, it is still >= 0.3° below target and rose < 0.3° in those 2 h |
| CV-ketel brandt niet | problem | Some room meets the demand condition above, and the gas meter did not move for 3 h |
| Tado onbereikbaar | problem | All Tado climate entities unavailable for 10 min (internet, Tado cloud, API limit) |
| Tado device offline | problem | A valve / thermostat / bridge `*_connection_state` off for 10 min; names the battery type |
| Hue Bridge onbereikbaar | problem | All Hue lamps unavailable for 10 min |
| Hue switch offline | problem | Its battery sensor unavailable for 10 min (usually an empty battery); names the battery type |
| Battery low | note | Hue switch <= 5 %, or Tado battery "low"; names the battery type. For a Hue switch the panel adds how much the level changed in the last 7 days ("Afgelopen week −3 % (5 → 2 %)"), from the recorder history |
| Hue lamp unreachable | note | A single lamp (not a room group) unavailable for 30 min, usually the wall switch is off |

The statistics sensors behind the heating checks (`sensor.<room>_warmtevraag_2u`, `..._temperatuur_stijging_2u`,
`sensor.gas_verbruik_3u`) need 2-3 hours of history; after a restart the recorder fills them from its history.
Timers ("for 10 minutes") use `last_changed`, which a restart resets, so offline devices reappear 10 minutes later.

## Battery types

| Device | Model | Battery |
|---|---|---|
| Hue dimmer switch v1 | RWL020 / RWL021 | CR2450 |
| Hue dimmer switch v2 | RWL022 | CR2032 |
| Hue wall switch module | RDM001 | CR2450 |
| Hue tap dial / smart button | RDM002 / ROM001 | CR2032 |
| Hue motion sensor | SML00x | 2x AAA |
| Tado smart radiator thermostat | VA01 / VA02 | 2x AA alkaline |
| Tado smart thermostat | RU01 / RU02 | 3x AAA alkaline |

New models go in the `cells` maps in `health.jinja`.

## Tado device names

Tado devices come in with their serial number as name (`VA0028051968`), so the slide says "Radiatorkraan" plus
the serial. Rename the device in Home Assistant (*Settings → Devices → the device → pencil*, e.g. "Kraan woonkamer")
and that name is used instead. The Tado app shows which serial sits in which room (*Settings → Rooms & Devices*).

## Adding a check

Append a dict to `ns.w` (problem) or `ns.i` (note) in `health.jinja`. Test it against live data before restarting:
the template can be posted as-is to `/api/template` with `{{ health_items() }}` appended. After a change to
`health.jinja`, run the action `homeassistant.reload_custom_templates`; a change to `health_monitor.yaml` needs a
restart (the statistics sensors).
