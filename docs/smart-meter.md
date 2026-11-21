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
