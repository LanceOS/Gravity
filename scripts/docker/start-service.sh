#!/bin/sh
set -eu

# Keep this check in the container too: a direct service start must never bypass
# Compose's required-variable interpolation.
case "${1:-}" in
  postgres)
    if [ -z "${POSTGRES_PASSWORD:-}" ]; then
      echo 'POSTGRES_PASSWORD must be set to a nonempty value.' >&2
      exit 1
    fi
    exec docker-entrypoint.sh postgres
    ;;
  redis)
    if [ -z "${GRAVITY_REDIS_PASSWORD:-}" ]; then
      echo 'GRAVITY_REDIS_PASSWORD must be set to a nonempty value.' >&2
      exit 1
    fi
    exec docker-entrypoint.sh redis-server --requirepass "$GRAVITY_REDIS_PASSWORD"
    ;;
  *)
    echo 'Usage: start-service.sh postgres|redis' >&2
    exit 2
    ;;
esac
