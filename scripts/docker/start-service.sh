#!/bin/sh
set -eu

# Keep this check in the container too: a direct service start must never bypass
# Compose's required-variable interpolation. The Compose URLs are assembled from
# these passwords, so allow only URL-unreserved characters.
validate_password() {
  name=$1
  value=$2
  case "$value" in
    '')
      echo "$name must be set to a nonempty value." >&2
      exit 1
      ;;
    *[!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._~-]*)
      echo "$name must contain only URL-safe letters, digits, '.', '_', '~', or '-'." >&2
      exit 1
      ;;
  esac
}

case "${1:-}" in
  postgres)
    validate_password POSTGRES_PASSWORD "${POSTGRES_PASSWORD:-}"
    exec docker-entrypoint.sh postgres
    ;;
  redis)
    validate_password GRAVITY_REDIS_PASSWORD "${GRAVITY_REDIS_PASSWORD:-}"
    # Avoid putting the secret in redis-server's process arguments or logs.
    redis_config=$(mktemp /dev/shm/gravity-redis.XXXXXX)
    trap 'rm -f "$redis_config"' EXIT
    printf 'requirepass %s\n' "$GRAVITY_REDIS_PASSWORD" > "$redis_config"
    if [ "$(id -u)" = 0 ]; then
      chown redis:redis "$redis_config"
    fi
    mv -f "$redis_config" /dev/shm/gravity-redis.conf
    trap - EXIT
    unset GRAVITY_REDIS_PASSWORD
    exec docker-entrypoint.sh redis-server /dev/shm/gravity-redis.conf
    ;;
  *)
    echo 'Usage: start-service.sh postgres|redis' >&2
    exit 2
    ;;
esac
