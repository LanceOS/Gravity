#!/bin/sh
set -eu

# Keep checks in each container: a direct service start must not bypass
# Compose's required-variable interpolation.
validate_secret() {
  name=$1
  value=$2
  case "$value" in
    '')
      echo "$name must be set to a nonempty value." >&2
      exit 1
      ;;
  esac

  normalized=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  case "$normalized" in
    *password*|*placeholder*|*changeme*|*replace*|*example*|*default*|*your*|*test*|*dummy*|*0123456789abcdef*|admin|rustfsadmin|redis|postgres|gravity|secret|root)
      echo "$name must not be a known or placeholder secret." >&2
      exit 1
      ;;
  esac

  case "${NODE_ENV:-production}" in
    development|test) return ;;
    production) ;;
    *) echo 'NODE_ENV must be development, test, or production.' >&2; exit 1 ;;
  esac

  if [ "${#value}" -lt 32 ]; then
    echo "$name must be at least 32 characters in production." >&2
    exit 1
  fi
  distinct=$(printf '%s' "$value" | LC_ALL=C awk '{ for (i = 1; i <= length($0); i++) seen[substr($0, i, 1)] = 1 } END { for (c in seen) count++; print count + 0 }')
  if [ "$distinct" -lt 8 ]; then
    echo "$name must have at least eight distinct characters in production." >&2
    exit 1
  fi
}

# PostgreSQL and Redis passwords are interpolated into backend connection URLs.
validate_url_password() {
  name=$1
  value=$2
  validate_secret "$name" "$value"
  case "$value" in
    *[!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._~-]*)
      echo "$name must contain only URL-safe letters, digits, '.', '_', '~', or '-'." >&2
      exit 1
      ;;
  esac
}

case "${1:-}" in
  postgres)
    validate_url_password POSTGRES_PASSWORD "${POSTGRES_PASSWORD:-}"
    exec docker-entrypoint.sh postgres
    ;;
  redis)
    validate_url_password GRAVITY_REDIS_PASSWORD "${GRAVITY_REDIS_PASSWORD:-}"
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
  rustfs)
    validate_secret RUSTFS_SECRET_KEY "${RUSTFS_SECRET_KEY:-}"
    shift
    # Preserve the current image's initialization and credential-source checks.
    # Reverify /entrypoint.sh when updating rustfs/rustfs:latest.
    exec /entrypoint.sh "$@"
    ;;
  *)
    echo 'Usage: start-service.sh postgres|redis|rustfs' >&2
    exit 2
    ;;
esac
