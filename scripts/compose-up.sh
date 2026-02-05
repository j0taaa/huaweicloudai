#!/usr/bin/env bash
set -euo pipefail

# Prefer the V2 plugin, but keep compatibility with environments that still
# expose only the legacy docker-compose binary.
if docker compose version >/dev/null 2>&1; then
  exec env COMPOSE_BAKE=false DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose up -d --build "$@"
fi

exec docker-compose up -d --build "$@"
