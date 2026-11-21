# Smart meter (P1)

**Meter:** Landis+Gyr E350 (ZMF110CBtFs2), 3-phase, header `/XMX5LGBBFFB231223809`.
The telegram reports **DSMR 4.2** (`1-3:0.2.8(42)`), one telegram every 10 s.

**Cable:** FTDI FT232R USB P1 cable, `/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A1BSZKI8-if00-port0`
on the host. In `compose.yaml` it is passed to `homeassistant` as **`/dev/ttyUSB0`**. Serial: 115200 8N1.

## What the meter sends

| OBIS | Value |
|---|---|
| `1-0:1.8.1` / `1-0:1.8.2` | Import kWh, tariff 1 (low) / tariff 2 (normal) |
| `1-0:2.8.1` / `1-0:2.8.2` | Export kWh, tariff 1 / tariff 2 |
| `1-0:1.7.0` / `1-0:2.7.0` | Current import / export, kW |
| `1-0:21/41/61.7.0`, `22/42/62.7.0` | Import / export per phase, kW |
| `1-0:31/51/71.7.0` | Current per phase, A (no voltage on this meter) |
| `0-1:24.2.1` | Gas m3, updated **hourly** |
| `1-0:32/52/72.32.0` | Voltage sags per phase |

## Home Assistant

*Settings → Devices & services → Add integration → DSMR Slimme Meter* → *Serial* →
port `/dev/ttyUSB0` (pick *Enter manually* if it is not listed) → DSMR version **4**.

Energy dashboard (*Settings → Dashboards → Energy*):
- Grid consumption: *Energy consumption (tarif 1)* and *(tarif 2)*.
- Return to grid: *Energy production (tarif 1)* and *(tarif 2)*.
- Gas: *Gas consumption*.

## Checks

Raw telegrams (stop the DSMR integration first, or just read once; only one reader at a time works reliably):

```sh
stty -F /dev/ttyUSB0 115200 cs8 -parenb -cstopb raw -echo clocal && timeout 12 cat /dev/ttyUSB0
```

If the cable is unplugged and plugged back in, run `docker compose restart homeassistant`: the device
mapping is made when the container starts.

## Energy dashboard and costs

Configured 2026-11-21 (stored in `data/homeassistant/.storage/energy`, backup of the previous version next to it):

| Source | Sensors | Price |
|---|---|---|
| Grid *Daltarief* | consumption / production tarif 1 | import and export EUR 0.27695/kWh |
| Grid *Piektarief* | consumption / production tarif 2 | import and export EUR 0.27695/kWh |
| Grid power (live) | on *Daltarief*, two sensors: *Power consumption* minus *Power production* | |
| Gas | *Gas consumption* | EUR 1.51574/m3 |

Tariffs: Budget Energie, fixed, incl. energy tax and VAT (2026). Same price for both tariffs.
Feed-in compensation EUR 0.01/kWh, supply costs EUR 6.99/month each for electricity and gas.

- **Export price = import price** because net metering (salderen) applies until 2026-12-31.
  **On 2027-01-01 change the export price of both grid sources to the feed-in compensation**
  (EUR 0.01, or whatever Budget Energie charges/pays by then).
- The dashboard only shows per-kWh/m3 costs. Fixed costs (supply costs, grid operator costs, energy tax rebate)
  are not included: Home Assistant has no setting for them (the `cost_adjustment_day` field in the storage file
  is not used anywhere).
- Only add one power sensor per grid; the live power sensor HA generates for the two-sensor setup is
  `sensor.energy_grid_electricity_meter_power_consumption_electricity_meter_power_production_net_power`.

## Fixed vs dynamic contract

### Live, in Home Assistant

[`homeassistant/packages/energy_contract.yaml`](../homeassistant/packages/energy_contract.yaml) (mounted into the
container with the jinja macros and the dashboard; registered in `configuration.yaml` under `homeassistant: packages:`
and `lovelace: dashboards:`):

- **Prices:** REST sensors fetch day-ahead prices (yesterday to tomorrow) from the public EnergyZero API every
  15 minutes. *Electricity/Gas market price* = current hour, excl. VAT; *Dynamic electricity/gas price* = all-in.
- **Cost counters:** on every meter update, usage since the previous reading x the current price, for both
  contracts: import cost, export credit, gas cost, supply costs (per hour), and a *total cost* per contract.
  They are `monetary`/`total` sensors, so the recorder keeps hourly long-term statistics of them forever,
  in the same database as the meter readings. Counting started 2026-11-21.
- **Net metering:** until 2026-12-31 export earns the import price (fixed) or market price + energy tax (dynamic);
  from 2027-01-01 the counters switch to EUR 0.01 (fixed) and market price (dynamic) automatically.
- **Dashboard:** *Contract* in the sidebar, fixed vs dynamic per month and per day.
- The dynamic markups and fees in the package are **assumptions**; replace them with a real offer.
  Changing a price only affects usage from then on.
- Usage while Home Assistant is down is charged at the first price after the restart.

### Afterwards, from the statistics

[`scripts/dynamic_compare.py`](../scripts/dynamic_compare.py) takes the measured hourly import, export and gas
from the Home Assistant statistics and the day-ahead prices from the public EnergyZero API (market prices
excl. VAT, hourly), and prints per month what the fixed contract and a dynamic contract would have cost, under
2026 rules (net metering) and 2027 rules (no net metering):

```sh
docker exec -i homeassistant python3 - < scripts/dynamic_compare.py
docker exec -i homeassistant python3 - --since 2026-12-01 < scripts/dynamic_compare.py
```

The dynamic markup, export fee and monthly fee at the top of the script are **assumptions**; replace them with a
real offer before deciding. Meaningful only after a few weeks of data, and ideally a full year (summer and winter).
Hourly statistics are kept forever, so the comparison can be rerun at any time.
