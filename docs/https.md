# HTTPS for Home Assistant

Home Assistant Cast (the Nest Hub screen, [nest-display.md](nest-display.md)) only works when Home Assistant is
reachable over `https://` with a valid certificate. Setup without opening any ports to the internet:

```
Nest Hub / phone ── https://NAME.duckdns.org ──► caddy :443 (Pi) ──► homeassistant :8123
                    DuckDNS A record = 192.168.2.26 (LAN only)
Let's Encrypt ◄── DNS-01 challenge: caddy writes a TXT record via the DuckDNS API
```

- **DuckDNS** (free) provides the name. Its A record points at the Pi's **LAN** IP, so the name only works at home.
- **Caddy** (`compose.yaml` service `caddy`, built from [`caddy/Dockerfile`](../caddy/Dockerfile) with the DuckDNS
  plugin) gets and renews the certificate and proxies to Home Assistant. Certificates live in `data/caddy/`.
- Home Assistant trusts the proxy: `use_x_forwarded_for: true`, `trusted_proxies: [127.0.0.1/32, ::1/128]`.
  Since 2026 the HTTP settings live in the UI-managed store `.storage/http` (key `stable`), and an `http:` block
  in `configuration.yaml` is **ignored** once migrated. Change them in the UI, or edit the store with
  Home Assistant stopped.

## Setup

1. Sign in at <https://www.duckdns.org> (done with the household Google account), create a subdomain
   (`tijs-homelab`), and copy the token.
2. Point the subdomain at the Pi's LAN IP (DuckDNS fills in the public IP by default; that is wrong here):
   `set -a; . ./.env; curl "https://www.duckdns.org/update?domains=${HA_DOMAIN%.duckdns.org}&token=$DUCKDNS_TOKEN&ip=192.168.2.26"`
3. In `.env`: `HA_DOMAIN=NAME.duckdns.org` and `DUCKDNS_TOKEN=...`.
4. `docker compose up -d caddy && docker compose logs -f caddy` and wait for *certificate obtained successfully*.
5. Enable the proxy settings above (*Settings → System → Network*, or `.storage/http`), restart Home Assistant.
6. Home Assistant: *Settings → System → Network → Home Assistant URL → Local network*: `https://NAME.duckdns.org`.
7. Test: `curl -sI https://NAME.duckdns.org | head -1` gives `HTTP/2 200` (or 405).

`http://192.168.2.26:8123` keeps working next to it.

## Security notes

- Nothing is reachable from the internet: no port forwarding, the certificate comes via DNS (DNS-01).
- Public: the name `tijs-homelab.duckdns.org` (in DNS and in the public certificate transparency logs) and that it
  points at `192.168.2.26`, a private address that is unreachable from outside.
- The **DuckDNS token** is the sensitive part: with it, someone can point the name elsewhere and get a valid
  certificate for it, then phish the Home Assistant login. Keep `.env` private; regenerate the token if in doubt.

## Caveats

- **DNS rebind protection:** some routers refuse public names that resolve to a private IP. Check with
  `nslookup NAME.duckdns.org 192.168.2.254`. Google devices (Nest Hub) usually ask Google DNS directly and are not
  affected; phones and laptops on the router's DNS might be. Fix: an exception in the router, or a DNS override.
- The DuckDNS record stays fixed on `192.168.2.26`: give the Pi a fixed DHCP lease (see the roadmap).
- Away from home the name points nowhere useful, which is intended; remote access is a separate choice.
