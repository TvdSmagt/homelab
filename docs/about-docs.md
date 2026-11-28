# About these docs

Markdown in `docs/`, menu in `zensical.toml`, built by [Zensical](https://zensical.org) and served by Caddy from
`data/docs-site/` at `https://docs.NAME.duckdns.org` (same certificate setup as [https.md](https.md)), with
`http://home-pi.local:8000` as a fallback. No container runs for the docs.

```sh
scripts/docs.sh          # build (publish)
scripts/docs.sh serve    # live preview on :8001
```

Not rebuilt automatically: run it after a pull or an edit.

**Writing:** short pages; show behaviour with an explorable instead of describing it. Explorables live in
`docs/assets/explorables.js` and go in a page as `<div data-xp="name"></div>`; their numbers and texts copy the
packages and `health.jinja`, so change both together. Files outside `docs/`: full GitHub link. Slide screenshots:
`OUT=docs/assets/slides scripts/panel-preview.sh`, then convert to WebP. No secrets or personal details.
