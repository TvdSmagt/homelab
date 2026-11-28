# Solar heating with the airco

While solar power is exported, the LG airco downstairs (`climate.airco_beneden`, LG ThinQ cloud) heats, so the
surplus replaces gas. [`solar_heating.yaml`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/packages/solar_heating.yaml),
since 2026-11-26.

<div data-xp="solar"></div>

- Grid power = P1 import − export, 5-minute average (DSMR *time between updates* = 0, so every 10 s telegram counts).
- Room temperature from Tado (`sensor.beneden_beneden_temperature`): the airco's own sensor reads ~6° too low.
- Measured draw: ~1,3 kW peak in the first 10 minutes, then ~0,55-0,6 kW at the setpoint; standby 60 W.
- Only the fan and setpoint can be set (no power limit). Tado needs no change: at its setpoint it stops the boiler.

**Nest Hub, Klimaat slide:** *AUTO* = the whole thing on/off, power button = manual (then left alone), − / + = the
solar target. Logbook entries on `climate.airco_beneden` give every start, stop reason and fan step.

<div data-xp="cop"></div>

The model's real COP is unknown (typical air-to-air: 3,5-4,5 at +7 °C, 2-2,5 at −7 °C).

## Data

Collected as hourly statistics since 2026-11-26 ([`heating_log.yaml`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/packages/heating_log.yaml)):
gas, outdoor temperature, wind, clouds, per-zone temperature, heating demand and setpoint, airco on / fan / own
reading / runtime, `sensor.house_power`. After a few weeks: compare hours with and without the airco at similar
weather; the gas difference is the saving. The airco's electricity is only estimated from `sensor.house_power`.
