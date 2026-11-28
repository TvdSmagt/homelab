#!/usr/bin/env bash
# Build or preview the documentation site (Zensical, config in zensical.toml, pages in docs/).
#
#   scripts/docs.sh           build into data/docs-site/, which Caddy serves at http://<pi>:8000
#   scripts/docs.sh serve     live preview while writing, http://<pi>:8001 (Ctrl-C to stop)
#
# Runs Zensical from its Docker image, so nothing is installed on the host. Caddy serves the built files, so a
# build is all it takes to publish; no container keeps running for the docs.
set -euo pipefail

cd "$(dirname "$0")/.."
image=zensical/zensical:0.1.4
run=(docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/docs")

mkdir -p data/docs-site
case "${1:-build}" in
  build)
    "${run[@]}" "$image" build --clean
    echo "Built data/docs-site/, served at http://$(hostname -I | awk '{print $1}'):8000"
    ;;
  serve)
    "${run[@]}" -it -p 8001:8001 "$image" serve --dev-addr 0.0.0.0:8001
    ;;
  *)
    echo "usage: $0 [build|serve]" >&2
    exit 1
    ;;
esac
