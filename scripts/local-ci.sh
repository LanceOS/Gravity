#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
PROJECT_NAME="gravity_local_ci"
POSTGRES_CONTAINER_NAME="${PROJECT_NAME}_postgres"
BACKEND_CONTAINER_NAME="${PROJECT_NAME}_backend"
FRONTEND_CONTAINER_NAME="${PROJECT_NAME}_frontend"

find_available_port() {
  local port="$1"

  while ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$port$"; do
    port=$((port + 1))
  done

  printf '%s\n' "$port"
}

POSTGRES_PORT="${GRAVITY_CI_POSTGRES_PORT:-$(find_available_port 45432)}"
BACKEND_PORT="${GRAVITY_CI_BACKEND_PORT:-$(find_available_port 48080)}"
FRONTEND_PORT="${GRAVITY_CI_FRONTEND_PORT:-$(find_available_port 43100)}"
BACKEND_PUBLIC_URL="http://localhost:${FRONTEND_PORT}"
FRONTEND_PUBLIC_URL="http://localhost:${FRONTEND_PORT}"

log() {
  printf '\n[gravity-ci] %s\n' "$1"
}

detect_compose() {
  if [[ -n "${GRAVITY_COMPOSE_BIN:-}" ]]; then
    printf '%s\n' "$GRAVITY_COMPOSE_BIN"
    return 0
  fi

  if command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    printf '%s\n' 'podman compose'
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf '%s\n' 'docker compose'
    return 0
  fi

  printf 'A compose CLI is required. Set GRAVITY_COMPOSE_BIN to override.\n' >&2
  return 1
}

COMPOSE_BIN="$(detect_compose)"

log "Using compose backend: $COMPOSE_BIN"
log "Using ports: postgres=$POSTGRES_PORT backend=$BACKEND_PORT frontend=$FRONTEND_PORT"

compose() {
  GRAVITY_POSTGRES_PORT="$POSTGRES_PORT" \
  GRAVITY_BACKEND_PORT="$BACKEND_PORT" \
  GRAVITY_FRONTEND_PORT="$FRONTEND_PORT" \
  GRAVITY_BACKEND_PUBLIC_URL="$BACKEND_PUBLIC_URL" \
  GRAVITY_FRONTEND_PUBLIC_URL="$FRONTEND_PUBLIC_URL" \
  GRAVITY_POSTGRES_CONTAINER="$POSTGRES_CONTAINER_NAME" \
  GRAVITY_BACKEND_CONTAINER="$BACKEND_CONTAINER_NAME" \
  GRAVITY_FRONTEND_CONTAINER="$FRONTEND_CONTAINER_NAME" \
    ${COMPOSE_BIN} -p "$PROJECT_NAME" -f "$ROOT_DIR/docker-compose.yml" "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-30}"

  while (( attempts > 0 )); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      return 0
    fi

    attempts=$((attempts - 1))
    printf '.'
    sleep 2
  done

  printf '\nTimed out waiting for %s\n' "$url" >&2
  return 1
}

trap cleanup EXIT

log 'Installing client dependencies'
npm ci --prefix "$CLIENT_DIR"

log 'Installing server dependencies'
npm ci --prefix "$SERVER_DIR"

log 'Running client tests'
npm test --prefix "$CLIENT_DIR"

log 'Running server tests'
npm test --prefix "$SERVER_DIR"

log 'Building client'
npm run build --prefix "$CLIENT_DIR"

log 'Building server'
npm run build --prefix "$SERVER_DIR"

log 'Starting compose stack for smoke validation'
compose up -d --build

log 'Waiting for backend health endpoint'
wait_for_url "${BACKEND_PUBLIC_URL}/api/v1/health"

log 'Waiting for frontend root page'
wait_for_url "${FRONTEND_PUBLIC_URL}/"

log 'Validating backend response payload'
curl --fail --silent --show-error "${BACKEND_PUBLIC_URL}/api/v1/health" | grep '"status":"ok"' >/dev/null

log 'Validating frontend response payload'
curl --fail --silent --show-error "${FRONTEND_PUBLIC_URL}/" | grep -i '<html' >/dev/null

log 'Local CI passed'