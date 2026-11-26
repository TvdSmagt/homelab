# Solar heating with the airco

When solar power is being exported, Home Assistant switches the LG airco downstairs (`climate.airco_beneden`)
to heating, so the surplus heats the house instead of the gas boiler. Package:
[homeassistant/packages/solar_heating.yaml](../homeassistant/packages/solar_heating.yaml). Set up 2026-11-26.

## LG ThinQ

Core integration *LG ThinQ*, with a Personal Access Token from <https://connect-pat.lgthinq.com> (ThinQ account,
all scopes), country NL. Cloud only: commands go through LG's servers, so it stops working without internet.
Devices: *Airco Beneden* and *Airco Boven*.

The airco's own `current_temperature` reads far too low (12 °C while Tado measured 17.9 °C), so the
automation uses Tado's `sensor.beneden_beneden_temperature` for the room temperature.

## How it decides

`sensor.grid_net_power` = P1 import minus export in W (positive = import), averaged over 5 minutes in
`sensor.grid_net_power_5_min_average`.

| | Condition |
|---|---|
| **Start** | average export > *start bij teruglevering* (1000 W) for 2 min, sun above the horizon, Tado downstairs < target - 0.5 °C, airco off |
| **Stop** | average import > *stop bij afname* (500 W) for 10 min, or Tado downstairs >= target for 5 min, or sunset, or *Zonneverwarming* switched off |

**Fan:** the airco starts on `low`. Every 10 minutes, if the 5-minute average still shows more export than
*ventilator hoger bij teruglevering* (700 W) with the airco running, the fan goes one step up (low → medium → high),
up to *max ventilator* (medium). As soon as the house imports, it drops back to `low`. The LG ThinQ integration offers
no power limit and no power sensor for the airco; the fan speed and the setpoint are the only knobs (plus the
*Energy saving* switch, not used yet).

The airco draws roughly 0.5-1.5 kW itself, so once it runs the export drops; hence separate start and stop
thresholds. The automation only switches the airco off if it switched it on (`input_boolean.solar_heating_active`):
manual use is left alone, and switching the airco off by hand clears that flag. Tado needs no changes: when the
room reaches Tado's setpoint, it stops calling the boiler.

## Settings (helpers, in the UI)

- *Zonneverwarming*: on/off for the whole thing.
- *Zonneverwarming doeltemperatuur*: 21 °C, sent to the airco and used as the stop temperature.
- *Zonneverwarming start bij teruglevering*: 1000 W.
- *Zonneverwarming stop bij afname*: 500 W.
- *Zonneverwarming ventilator hoger bij teruglevering*: 700 W.
- *Zonneverwarming max ventilator*: medium.

The values are kept across restarts (no `initial:` in the YAML).

## Nest Hub (Klimaat slide)

The row *Airco beneden* ([nest-display.md](nest-display.md)):

- **AUTO** switches *Zonneverwarming* on/off. Switching it off while the automation has the airco on turns the airco off.
- **Power** turns the airco on (heat) or off by hand. Switched on by hand, the automation leaves it alone.
- **- / +** change the solar target (the automation passes it to the running airco) when the airco is off or running
  on solar, and the airco's own setpoint when it was switched on by hand.
- Status: *op zon · laag/middel/hoog*, *handmatig · …*, *uit · wacht op zon* (AUTO on) or *uit*.

Only the airco downstairs is controlled; *Airco Boven* is in Home Assistant but not used.

## Log

- **Logbook** (*Zonneverwarming*, on `climate.airco_beneden`): every start with export and room temperature, every
  stop with the reason (import, target reached, sunset, AUTO off, switched off by hand), and every fan step.
  The logbook and the raw climate history are kept 10 days (recorder default).
- **Runtime counters**, with long-term statistics (kept forever): `sensor.airco_beneden_draaiuren` (any mode but off)
  and `sensor.airco_beneden_draaiuren_op_zon` (on through this automation). Hours per day/week/month: a statistic or
  statistics-graph card with *change*. They integrate the 0/1 sensors `sensor.airco_beneden_aan(_op_zon)`; the unit
  is set with `customize`, since a unitless source gives the counter no unit.

## Cost

With the 2026 fixed tariffs, airco heat (EUR 0.277/kWh / COP ~3.5 ≈ EUR 0.08 per kWh of heat) is already cheaper than gas
(EUR 1.516/m3 / ~8.8 kWh ≈ EUR 0.17), even when the power is imported. Until 2026-12-31, net metering means exported
power earns the import price; from 2027-01-01 it earns ~EUR 0.01, which makes heating with the surplus nearly free.
For now it only runs on surplus, by choice.
