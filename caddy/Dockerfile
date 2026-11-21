# Caddy with the DuckDNS DNS plugin, for a Let's Encrypt certificate via the DNS-01 challenge
# (no ports opened to the internet). Built locally: docker compose build caddy
FROM caddy:2.10.2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/duckdns

FROM caddy:2.10.2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
