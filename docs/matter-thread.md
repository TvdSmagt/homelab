# Matter over Thread (ZBT-2)

```
IKEA GRILLPLATS ── Thread ──► ZBT-2 ── USB ──► otbr (wpan0, REST :8081) ──► Home Assistant
                                                                          ▲
                                     matter-server (ws://localhost:5580/ws) ┘
```

## Radio

Home Assistant Connect **ZBT-2**, `/dev/serial/by-id/usb-Nabu_Casa_ZBT-2_B81F3FD18AD8-if00`,
passed to `otbr` as `/dev/ttyACM0`.

It shipped with Zigbee (EZSP 7.5.1.0) firmware. On 2026-11-21 it was flashed with
**OpenThread RCP 2.7.2.0** (`zbt2_openthread_rcp_2.7.2.0_GitHub-fb0446f53_gsdk_2025.6.2.gbl`, from
the stable [NabuCasa/silabs-firmware-builder](https://github.com/NabuCasa/silabs-firmware-builder/releases)
release `v2026.02.23`). Serial: 460800 baud, hardware flow control.

Flash or check (stop `otbr` first, `docker compose stop otbr`). This uses the flasher that is in the Home Assistant image:

```sh
FW=$PWD/fw   # directory with the downloaded .gbl
DEV=/dev/serial/by-id/usb-Nabu_Casa_ZBT-2_B81F3FD18AD8-if00
# check which firmware is on it
docker run --rm --device $DEV:/dev/zbt2 --entrypoint python ghcr.io/home-assistant/home-assistant:stable \
  -m universal_silabs_flasher --device /dev/zbt2 --probe-methods spinel:460800,ezsp:460800 probe
# flash (use the zbt2_zigbee_ncp_*.gbl to go back to Zigbee)
docker run --rm --device $DEV:/dev/zbt2 -v $FW:/fw:ro --entrypoint python ghcr.io/home-assistant/home-assistant:stable \
  -m universal_silabs_flasher flash --device /dev/zbt2 --profile zbt2 --firmware /fw/<file>.gbl
```

## Containers

- `otbr`: [ownbee/hass-otbr-docker](https://github.com/ownbee/hass-otbr-docker), the official Home
  Assistant OTBR add-on repackaged without the Supervisor. Host network, privileged (it creates `wpan0`
  and ip6tables/ipset rules). Thread data in `data/otbr`. Web UI on `:8083`.
- `matter-server`: [matter-js/matterjs-server](https://github.com/matter-js/matterjs-server), the
  successor of the archived python-matter-server, same WebSocket API. Host network. Fabric data in
  `data/matter-server` (**back this up** together with `data/otbr`, see [README](../README.md#backup): losing either means re-pairing every device). Dashboard on `:5580`.

## Host (one time, needs sudo)

The Thread network must be reachable from the LAN (phones, other border routers), so enable IPv6 forwarding.
NetworkManager handles router advertisements on eth0 itself, so forwarding does not break the Pi's own IPv6.

```sh
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee /etc/sysctl.d/60-otbr.conf
sudo sysctl --system
docker compose restart otbr   # the "IPv6 forwarding is not enabled" warning should be gone
```

## Home Assistant setup

1. *Add integration → OpenThread Border Router*, URL `http://localhost:8081`.
   This creates a Thread network on the ZBT-2.
2. *Add integration → Thread*, then on the Thread integration's *Configure* screen make the new
   `home-pi-otbr` network the **preferred network**.
3. *Add integration → Matter*, URL `ws://localhost:5580/ws` (pick "custom"/"do not use the app" when asked).
4. Phone, in the regular **Home Assistant app** (Android or iOS), on the home WiFi with Bluetooth on:
   *Settings → Companion app → Troubleshooting → Sync Thread credentials*. This makes the ZBT-2 network
   the phone's preferred Thread network, so new plugs join it and not the Google Nest one. Can be done before
   the plugs arrive.
5. Add a plug: *Settings → Devices → Add device → Matter*, scan the QR code on the plug, keep the phone
   next to it (Bluetooth). Start with one plug close to the meter cabinet; it acts as a Thread router for the rest.

## Notes

- The LAN already has a second Thread network (route `fdfd:172e:1b32:1::/64` in `ip -6 route`), from the
  **Google Nest**. It does not conflict: each Thread network has its own key and they ignore each other. Thread cannot
  be turned off on Nest devices, and that is not needed. Keep the ZBT-2 network as preferred in the Thread integration.
  Both use 2.4 GHz; if plugs are flaky, change the Thread channel. To control a plug from Google Home as well,
  share it from Home Assistant (Matter multi-admin); it stays on the ZBT-2 network.
- Pairing uses the phone's built-in Matter support (Google on Android, Apple on iOS) via the Home Assistant app.
- After unplugging the ZBT-2, run `docker compose restart otbr`.
- Checks: `curl -s localhost:8081/node/state` (should be `leader` once the network exists),
  `docker compose logs otbr matter-server`.
