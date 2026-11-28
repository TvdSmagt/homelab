# Maintenance

**Update** (read the release notes for Tado, Hue, DSMR, LG ThinQ, Cast, Matter first):

```sh
docker compose pull homeassistant && docker compose up -d homeassistant && docker image prune -f
```

Back: pin the previous tag in `compose.yaml`; only safe with a backup from before (the database migrates forward).

**Logs:** `docker logs --tail 100 -f homeassistant`; more for one integration: action `logger.set_level`.

## Backup

Git holds the config; this archive holds the rest. `data/otbr` and `data/matter-server` cannot be recreated (all Matter
devices would need pairing again). HA's own backups cover only `/config`.

```sh
docker compose stop homeassistant matter-server otbr
sudo tar czf ~/homelab-backup-$(date +%F).tar.gz data/matter-server data/otbr data/homeassistant .env
sudo chown $USER: ~/homelab-backup-$(date +%F).tar.gz
docker compose start otbr matter-server homeassistant
```

Copy it off the Pi. **Restore:** Docker, clone the repo, unpack the archive in it, check the `/dev/serial/by-id/` ids
in `compose.yaml`, the [Thread host steps](../matter-thread.md#host-one-time-needs-sudo),
`docker compose build caddy && docker compose up -d`, `scripts/docs.sh`.

## Known issues

| Symptom | Cause / fix |
|---|---|
| Nest shows *Not connected* | pychromecast reconnect loop; an automation reloads Cast and recasts |
| Tado `unavailable` | cloud down or daily API limit; heating runs on, wait |
| Hue switch `unavailable` | empty battery ([types](../health-monitor.md#battery-types)) |
| Cards look old | cached JS: `scripts/deploy-panel.sh` |
| Slow | 2 GB RAM is tight (HA ~450 MB, Matter ~150 MB, VS Code remote ~1 GB): `free -m`, `docker stats --no-stream` |
