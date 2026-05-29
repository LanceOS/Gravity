#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/../.." && pwd)"
DEFAULT_COMPOSE="docker/docker-compose.watch.yml"

usage() {
  cat <<-EOF
Usage: $(basename "$0") <start|stop|rebuild|watch|logs|status> [compose-file]

Commands:
  start     Start the full dev stack (detached)
  stop      Stop and remove the stack
  rebuild   Rebuild images and restart the stack
  watch     Start the stack (detached) and tail logs
  logs      Tail compose logs
  status    Show compose ps

If [compose-file] is omitted the script uses: $DEFAULT_COMPOSE
EOF
  exit 1
}

if [ "$#" -lt 1 ]; then
  usage
fi

CMD="$1"; shift || true
COMPOSE_FILE_ARG="${1:-}"

if [ -n "$COMPOSE_FILE_ARG" ]; then
  COMPOSE_FILE="$COMPOSE_FILE_ARG"
else
  COMPOSE_FILE="$DEFAULT_COMPOSE"
fi

COMPOSE_PATH="$REPO_ROOT/$COMPOSE_FILE"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not found in PATH." >&2
  echo "Install Docker or run the equivalent commands with podman compose." >&2
  exit 2
fi

cd "$REPO_ROOT"

case "$CMD" in
  start)
    docker compose -f "$COMPOSE_PATH" up -d
    ;;
  stop)
    docker compose -f "$COMPOSE_PATH" down
    ;;
  rebuild)
    docker compose -f "$COMPOSE_PATH" pull || true
    docker compose -f "$COMPOSE_PATH" build --no-cache
    docker compose -f "$COMPOSE_PATH" up -d
    ;;
  watch)
    docker compose -f "$COMPOSE_PATH" up -d
    docker compose -f "$COMPOSE_PATH" logs -f --tail 200
    ;;
  logs)
    docker compose -f "$COMPOSE_PATH" logs -f --tail 200
    ;;
  status)
    docker compose -f "$COMPOSE_PATH" ps
    ;;
  *)
    usage
    ;;
esac
