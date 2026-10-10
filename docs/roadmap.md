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

**Use:** per-appliance metering of the dishwasher, washing machine, dryer, etc. (see section 4).
Check the plug's maximum load against the appliance (dryers and washers can draw 2-2.5 kW) and whether
Home Assistant exposes a kWh energy sensor, not only power in W (the Energy dashboard needs kWh;
otherwise add a Riemann sum helper on the power sensor).

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

## 4. Energy insight and load shifting

**Goal:** see how much is used and when, find what can move to another moment (sun surplus, cheap
hours), and collect data to size solar panels and a home battery for the new-build house. A heat pump
is planned there (EV charger later), so today's profile is only a baseline.

**Measurement layers:**
| Layer | Source | Resolution |
|---|---|---|
| Total import/export/consumption | P1 (section 1) | seconds, kept as hourly statistics |
| Shiftable appliances | IKEA plugs (section 2) | kWh counter per appliance |
| Solar production | Growatt via Grott | ~5 min |
| Heat pump | see below | ~hourly |

**Recorder (write once the P1 entities exist, so the entity names are known):**
- Hourly long-term statistics are kept forever by default (~100 MB for 2 years): enough for a first estimate.
- Do not raise `purge_keep_days` to 730: raw P1 states would grow to tens of GB/year.
  Exclude the fast P1 power sensors from `recorder`, keep the kWh counters.
- Battery sizing needs quarter-hour data; HA keeps 5-minute statistics only 10 days. Plan: a nightly
  export of `statistics_short_term` for the totals and the appliance counters to CSV.
- Collect at least one full year (summer and winter) before sizing anything.

**Insight:** Energy dashboard with *Individual devices*, a usage heatmap (hour of day x day of year, ApexCharts),
`utility_meter` for day/night or dynamic-tariff splits later.

**Sizing notes:**
- Yield per kWp from the current array only applies to this roof; use PVGIS for the new roof
  (tilt, azimuth). Record the current system's kWp.
- Net metering (salderen) ends 2027-01-01 in NL, which makes self-consumption worth more than export.

**Heat pump (new-build, probably Itho Daalderop):** no official Home Assistant integration.
- WPU: the community [Itho WiFi add-on](https://github.com/arjenhiemstra/ithowifi) publishes to MQTT
  (Mosquitto already runs), with the HACS integration `haithowifi` on top. Energy counters need
  WPU firmware >= 34 and are polled ~hourly. Newer units may use the NRG.watch interface (MQTT); unverified.
- Control is limited to boost/block (RS485 per a third-party vendor); no Modbus support confirmed.
- The new house will have its own meter (check DSMR version; the P1 cable can move with the Pi).

**Rough heat pump estimate (ground-source, A++++ semi-detached, 170 m2, pitched roof):**
Order-of-magnitude only, to be replaced by the installer's calculation and later by measured data.
- Household: 2 parents, 2 young children, maybe a third later. Size for the future: hot water use grows as
  children get older (longer showers, more laundry), so assume 4-5 persons.
- Space heating: ~15-30 kWh/m2/year thermal, so ~2,500-5,000 kWh. Hot water: ~3,000-4,500 kWh for 4-5 persons.
- Seasonal COP ~4-5 (floor heating, low flow temperature; hot water is lower, ~3). Electricity: **~1,300-2,400 kWh/year**
  for the heat pump, on top of household base load.
- Mostly in Nov-Feb when solar yield is lowest, so panels cover little of it and a battery (daily cycle) barely helps.
  Hot water, however, runs year-round and can be shifted to sunny hours; floor heating buffers heat for hours.
- Design heat loss is probably only ~3-5 kW, so electrical peak draw of the heat pump itself is modest
  (backup element, if any, is the large load; ask).

**Questions for installer / seller:**
1. Exact heat pump model and firmware (Itho WPU or other; to my knowledge the WPU is the ground-source line, confirm).
2. Which **local** interface (no cloud): MQTT, Modbus (TCP/RS485), NRG.watch? Standard or optional?
3. Can energy use (kWh) be read, how often is it refreshed, which firmware is needed?
4. What control is possible (boost, block, power) and is it local or cloud only?
5. Does the local interface keep working without internet, and if Itho stops the app?
6. Is the heat pump on its own group, and can a DIN-rail kWh meter with readout (Modbus/M-Bus/WiFi) be fitted there?
7. Smart meter: which DSMR version, is the P1 port free and enabled?
8. Meter cabinet: room and 230 V for a Pi, network (UTP) or WiFi coverage?
9. Connection capacity (e.g. 3x25 A vs 3x35 A): enough for heat pump, induction and a possible battery/EV later? Upgrade cost?
10. Is there a spare group slot and a conduit route for a later EV charger and battery?
    A mantelbuis (conduit) can be requested as an option: ask for it from the meter cabinet to the
    car spot, and consider a second one to the battery location and a UTP cable to the cabinet.
    Also ask for a hot water vessel sized for 4-5 persons.
11. Can the solar inverter be read locally (Modbus, MQTT), not only via a cloud app?
12. Ground loop: type (vertical bore), regulation/permit, and the backup element size.
13. Space and a prepared group for a home battery; which inverter type (hybrid or AC-coupled) fits?

Roof pitch/orientation is known (calculate in PVGIS), no shading expected, and the energy contract is
the owner's own choice (compare feed-in terms after 2027-01-01), so those are not installer questions.

**Home battery: purchase criteria** (not all batteries can be controlled; check per model, brands change fast):
- Local API without cloud requirement (Modbus TCP, MQTT or REST). Brands I know offer local control include
  Victron, Huawei LUNA, Sungrow, SMA and Sessy; not verified recently.
- Control needed for the goal (charge only on surplus or before an expected evening peak):
  1. self-consumption (charge from solar surplus; usually default),
  2. charge from grid at cheap hours, with a setpoint or time window (needs a dynamic contract),
  3. hold or force discharge (save energy for the evening peak),
  4. charge/discharge power setpoint in W, not only on/off.
- Works with the chosen inverter (hybrid or AC-coupled) and fits the connection capacity.
- Warranty stays valid with external control.
- No mandatory supplier subscription that takes over control of the battery.
- Limits: in winter the heat pump runs while solar yield is low, so shift loads (hot water, floor) rather than buffer;
  a 7-11 kW EV charge empties a 5-10 kWh battery in about an hour, so shift the EV itself.
- Peak forecasting in Home Assistant: Forecast.Solar, hourly prices, own usage profile (needs the battery to be locally controllable).

## 5. EV charger (later)

Not now; the owner places the charger. When it is time: choose one that reports consumption locally
(OCPP or Modbus) and accepts a charge-power setpoint, so charging can follow solar surplus or cheap hours
(largest shiftable load). A certified installer connects the group; check connection capacity first (question 9).
