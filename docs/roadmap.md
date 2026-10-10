# Roadmap

Planned additions to the stack, as of 2026-10-10.

## Done

- Mosquitto, Grott, Home Assistant running ([README](../README.md)).
- Growatt ShineLAN redirected to Grott; inverter shows up in Home Assistant
  ([growatt-datalogger.md](growatt-datalogger.md)).

## Open housekeeping

- [ ] Fixed DHCP leases in the router: Pi `192.168.2.26`, Growatt logger `192.168.2.18`.
- [ ] Change the Growatt logger's web UI password from the factory default.
- [ ] Energy dashboard: solar production = **Generated energy (Total)** (`pvenergytotal`, AC output).
  Not *Generated PV energy (Total)* (`epvtotal`), which is DC input before inverter losses (~1.6%).
- [ ] Hide the unused *Phase 2/3 power* sensors (single-phase inverter).
- [ ] Optional: configure Forecast.Solar (one entry per panel string: tilt, azimuth, Wp).

## 1. Smart meter (P1)

Growatt only measures production. Consumption, grid import/export and gas come from the smart meter.

**Meter:** Landis+Gyr E350 (ZMF110CBtFs2), DSMR 4.0, 3-phase, in the meter cabinet next to the Pi.

**P1 port:** RJ12, behind the small white flip-up cover to the right of the "1 2 3 4 / M1 M2" terminal
block in the lower half of the meter. Do not open the large sealed terminal cover below it.

**Hardware:** USB P1 cable for DSMR 4/5 (RJ12 → USB, built-in FTDI converter), ~€15, long enough
to reach the Pi. DSMR 4.0 does not power devices on the P1 port; the cable is powered over USB.
Avoid the cheapest no-name cables. Status: being ordered.

**Setup steps (once plugged in):**
1. Find the device under `/dev/serial/by-id/` and pass it through to the `homeassistant` service in `compose.yaml`.
2. Home Assistant: *Settings → Devices & services → Add integration → DSMR Slimme Meter*,
   type *Serial*, that device path, DSMR version **4**.
3. Energy dashboard: grid consumption (tariff 1 + 2), return to grid (tariff 1 + 2), gas.
4. Document the meter in `docs/smart-meter.md`.

## 2. Matter over Thread (IKEA GRILLPLATS plugs)

The IKEA GRILLPLATS smart plugs are Matter over **Thread**, so a Thread border router is needed.
They also measure power usage.

**Hardware:** Home Assistant Connect **ZBT-2** (Nabu Casa, EAN 860011789741), ~€50, run with
Thread firmware. Not the ZWA-2 (that is Z-Wave only). One radio does Zigbee *or* Thread, not both;
a second radio is needed if Zigbee devices are added later.
Status: out of stock almost everywhere in NL; Robbshop/HAshop expect it mid-October 2026.

**Placement:** in the meter cabinet (wooden door, fine for 2.4 GHz), on the included 1 m USB extension,
away from the Pi's USB 3 ports and from the metal of the meter/fuse box, high and upright.
The plugs are mains powered and act as Thread routers, so add one close to the cabinet first.

**Setup steps (once plugged in):**
1. Flash Thread firmware on the ZBT-2.
2. Add containers to `compose.yaml` (Home Assistant runs in Docker, so no add-ons):
   - OpenThread Border Router, with the ZBT-2 passed through
   - Matter Server (host network; IPv6 is available on the LAN)
3. Home Assistant: add the *Thread* and *Matter* integrations.
4. Commission plugs with the Home Assistant Companion app (QR code on the plug, via Bluetooth).
5. Document in `docs/matter-thread.md`.

**Caveats:** early reports on IKEA's Matter-over-Thread devices in Home Assistant are mixed (pairing
issues, plugs dropping off). Start with one or two plugs. If Thread links are flaky, change the Thread
channel or the 2.4 GHz WiFi channel to avoid overlap.

## 3. Remote access (undecided)

The Home Assistant Companion app works on the home WiFi via `http://192.168.2.26:8123`.
For access from outside, options:
- **Tailscale** (free, preferred): VPN on the Pi and the phone, no ports opened. Needs a one-time install on the host.
- **Home Assistant Cloud / Nabu Casa** (~€7.50/month): easiest, supports Home Assistant development.
- Port forwarding: not recommended.
