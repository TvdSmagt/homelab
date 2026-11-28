# Smart meter (P1)

Landis+Gyr E350, DSMR 4.2, telegram every 10 s; gas updates hourly. FTDI P1 cable
(`/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A1BSZKI8-if00-port0`) → `/dev/ttyUSB0` in the container, 115200 8N1.
Integration *DSMR Slimme Meter*, serial, version 4. Replugged the cable? `docker compose restart homeassistant`.

```sh
# raw telegrams (one reader at a time)
stty -F /dev/ttyUSB0 115200 cs8 -parenb -cstopb raw -echo clocal && timeout 12 cat /dev/ttyUSB0
```

**Energy dashboard:** import tariff 1 + 2, export tariff 1 + 2, gas; fixed prices € 0,27695/kWh and € 1,51574/m³
(Budget Energie 2026). Export = import price while net metering lasts. **On 2027-01-01 set the export price to the
feed-in compensation (€ 0,01).** Fixed monthly costs are not in the dashboard.

## Fixed vs dynamic contract

<div data-xp="price"></div>

[`energy_contract.yaml`](https://github.com/TvdSmagt/homelab/blob/main/homeassistant/packages/energy_contract.yaml)
fetches EnergyZero day-ahead prices and keeps cost counters for both contracts on every meter reading (since
2026-11-21, kept forever as statistics; switches to 2027 rules by itself). The dynamic markups are **assumptions**:
replace them with a real offer. Shown on the *Contract* dashboard and the Verleden slide.

Afterwards from the statistics, per month, under 2026 and 2027 rules:

```sh
docker exec -i homeassistant python3 - --since 2026-12-01 < scripts/dynamic_compare.py
```
