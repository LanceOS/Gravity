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
  watch     Start the stack (detached) and run the compose watcher
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

if command -v podman >/dev/null 2>&1; then
  COMPOSE_BIN="podman"
elif command -v docker >/dev/null 2>&1; then
  COMPOSE_BIN="docker"
else
  echo "podman or docker is required but not found in PATH." >&2
  echo "Install Podman or Docker to use this helper." >&2
  exit 2
fi

COMPOSE_CMD="$COMPOSE_BIN compose"

cd "$REPO_ROOT"

case "$CMD" in
  start)
    $COMPOSE_CMD -f "$COMPOSE_PATH" up -d
    ;;
  stop)
    $COMPOSE_CMD -f "$COMPOSE_PATH" down
    ;;
  rebuild)
    $COMPOSE_CMD -f "$COMPOSE_PATH" pull || true
    $COMPOSE_CMD -f "$COMPOSE_PATH" build --no-cache
    $COMPOSE_CMD -f "$COMPOSE_PATH" up -d
    ;;
  watch)
    $COMPOSE_CMD -f "$COMPOSE_PATH" up -d
    $COMPOSE_CMD -f "$COMPOSE_PATH" watch
    ;;
  logs)
    $COMPOSE_CMD -f "$COMPOSE_PATH" logs -f --tail 200
    ;;
  status)
    $COMPOSE_CMD -f "$COMPOSE_PATH" ps
    ;;
  *)
    usage
    ;;
esac

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
  watch     Start the stack (detached) and run the compose watcher
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

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required but not found in PATH." >&2
  echo "Install Podman or run the equivalent commands with docker compose." >&2
  exit 2
fi

cd "$REPO_ROOT"

case "$CMD" in
  start)
    podman compose -f "$COMPOSE_PATH" up -d
    ;;
  stop)
    podman compose -f "$COMPOSE_PATH" down
    ;;
  rebuild)
    podman compose -f "$COMPOSE_PATH" pull || true
    podman compose -f "$COMPOSE_PATH" build --no-cache
    podman compose -f "$COMPOSE_PATH" up -d
    ;;
  watch)
    podman compose -f "$COMPOSE_PATH" up -d
    podman compose -f "$COMPOSE_PATH" watch
    ;;
  logs)
    podman compose -f "$COMPOSE_PATH" logs -f --tail 200
    ;;
  status)
    podman compose -f "$COMPOSE_PATH" ps
    ;;
  *)
    usage
    ;;
esac
