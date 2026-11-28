# Packages

One file per feature in [`homeassistant/packages/`](https://github.com/TvdSmagt/homelab/tree/main/homeassistant/packages);
its header comment explains it.

| Package | Main entities | Automations | Docs |
|---|---|---|---|
| `nest_display` | `sensor.house_power`, `sensor.rain_forecast`, `*_today` counters, `sensor.energy_score_today` | cast at 07:00-22:30, stop, fix reconnect loop; scripts *toon / herstart dashboard* | [Nest Hub](../nest-display.md) |
| `energy_contract` | EnergyZero prices, `sensor.dynamic_electricity_price`, `sensor.{fixed,dynamic}_contract_total_cost` | | [Smart meter](../smart-meter.md) |
| `solar_heating` | `input_*.solar_heating_*`, `sensor.grid_net_power_5_min_average`, runtime counters | 5× *Zonneverwarming* | [Solar heating](../solar-heating.md) |
| `heating_log` | setpoints, airco state, wind, clouds (statistics only) | | [Solar heating](../solar-heating.md#data) |
| `health_monitor` | `sensor.home_health`, `*_warmtevraag_2u`, `*_temperatuur_stijging_2u` | | [Health monitor](../health-monitor.md) |

**Macros** (`custom_templates/`): `health.jinja` → `health_items()`; `energy_contract.jinja` → `hour_price()`,
`cost_state()`. Import with `{% from 'health.jinja' import health_items %}`; lists go out as `to_json`, in as `from_json`.

**Dashboards**: *Nest Hub* (`/nest-hub/thuis`, the full-screen panel `homelab-ambient-panel.js`), *Contract*, and
*Docs* (`/homelab-docs/docs`, this site in an iframe).
Cards are plain JS custom elements, no build step.

**New package:** header comment, a `unique_id` on every entity, a `state_class` if history should last, then check
and restart (see [setup](index.md)).
