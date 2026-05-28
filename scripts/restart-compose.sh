#!/usr/bin/env bash
set -euo pipefail

# restart-compose.sh
# Helper to stop/start/rebuild the Docker/Podman Compose stack without removing volumes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/docker-compose.yml"
ENV_FILE="$REPO_ROOT/.env"

podman_compose_available() {
  command -v podman >/dev/null 2>&1 &&
    podman info >/dev/null 2>&1 &&
    podman compose version >/dev/null 2>&1
}

if podman_compose_available; then
  COMPOSE_CLI="podman"
elif command -v docker >/dev/null 2>&1; then
  COMPOSE_CLI="docker"
else
  echo "Error: neither a working podman compose setup nor docker found in PATH" >&2
  exit 1
fi

compose() {
  "$COMPOSE_CLI" compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [service]
Commands:
  stop            -- stop the compose stack (no volume removal)
  start           -- start the stack (detached)
  rebuild         -- rebuild images and start (detached)
  restart         -- stop then rebuild and start
  status          -- show compose ps
  logs [service]  -- show logs (service optional)
EOF
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

cmd=$1
shift || true

# Warn if .env not found
if [ ! -f "$ENV_FILE" ]; then
  echo "Warning: $ENV_FILE not found. Compose will use the environment from the shell." >&2
fi

case "$cmd" in
  stop)
    echo "Stopping compose (no volumes removed)..."
    compose down --remove-orphans
    ;;
  start)
    echo "Starting compose (detached)..."
    compose up -d
    ;;
  rebuild)
    echo "Rebuilding and starting compose (detached)..."
    compose up -d --build
    ;;
  restart)
    echo "Restarting compose: down then rebuild & start..."
    compose down --remove-orphans
    compose up -d --build
    ;;
  status)
    compose ps
    ;;
  logs)
    if [ $# -eq 0 ]; then
      compose logs --tail 200
    else
      compose logs --tail 200 "$@"
    fi
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 2
    ;;
esac
