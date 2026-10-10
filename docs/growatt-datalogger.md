# Growatt datalogger

## Device

| | |
|---|---|
| Type | Growatt ShineLAN (Hi-Flying serial-to-WiFi module, "M2M Web Server" firmware) |
| Serial | `YUZ0644211` (from the label, not shown in the web UI) |
| LAN address | `192.168.2.18` (MAC `ac:cf:23:eb:88:23`) |
| Web UI | <http://192.168.2.18>, HTTP basic auth, factory default `admin` / `admin` |
| Inverter link | UART 9600 baud, 8N1 |
| Monitoring account | Registered through the installer (Zelfstroom) on Growatt's platform |

Give it a fixed DHCP lease in the router so this documentation stays valid.

The web UI has no Growatt branding and mixes English and Chinese pages (a per-page language
setting, `slanV`). That is cosmetic; all pages edit the same configuration.

## Server setting

The logger connects as a TCP **client** to a server, configured on the UART/network page
(`/uart_config.html`, form `form_net_setting`):

| Field | Factory value | With Grott |
|---|---|---|
| Server address (`net_ip`) | `server.growatt.com` | `192.168.2.26` (this Pi) |
| Port (`net_port`) | `5279` | `5279` |
| Mode (`net_mode`) | client | client |
| Protocol (`net_protocol`) | TCP | TCP |

Only change the server address; leave everything else as is.

```
inverter ─UART─► logger 192.168.2.18 ─TCP 5279─► grott on 192.168.2.26 ─► server.growatt.com:5279
                                                       │
                                                       └─► mosquitto ─► Home Assistant
```

Grott forwards all traffic unchanged to `server.growatt.com`, so the Zelfstroom / Growatt portal and app
keep working. No login at server.growatt.com is needed for this change.

**Prerequisite:** the Pi must have a fixed IP (`192.168.2.26`, DHCP reservation in the router).
If the Pi's address changes or the stack is down, the logger cannot deliver data to Growatt either.
It buffers data and Grott forwards the backlog once it reconnects (`sendbuf = True`).

**Rollback:** set the server address back to `server.growatt.com`.

## Status

- [ ] Fixed DHCP lease for the Pi (`192.168.2.26`) and the logger (`192.168.2.18`)
- [ ] Logger server address changed to `192.168.2.26`
- [ ] Data visible in `docker compose logs -f grott`, serial matches `YUZ0644211`
- [ ] Growatt device appears in Home Assistant
- [ ] Turn `verbose` off again in `grott/grott.ini`
- [ ] Change the logger's web UI password from the factory default

## Verifying

```sh
docker compose logs -f grott                  # look for incoming data from the logger
set -a; . ./.env; set +a
docker compose exec mosquitto mosquitto_sub -u "$MQTT_USER" -P "$MQTT_PASSWORD" -t 'energy/#' -v
```
