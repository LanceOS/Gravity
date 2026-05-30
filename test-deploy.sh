#!/usr/bin/env bash

# Use bash strict mode
set -euo pipefail

# Define color helper functions for styling output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

log_success() {
  printf "${GREEN}[SUCCESS]${NC} %s\n" "$1"
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_error() {
  printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

# 1. Get root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 2. Parse arguments
ACTION="up"
BACKEND="auto"
ADDITIONAL_ARGS=()

for arg in "$@"; do
  case $arg in
    start|up)
      ACTION="up"
      ;;
    stop|down)
      ACTION="down"
      ;;
    podman|docker|auto)
      BACKEND="$arg"
      ;;
    *)
      ADDITIONAL_ARGS+=("$arg")
      ;;
  esac
done

# 3. Determine Compose CLI
COMPOSE_CMD=""
if [[ "$BACKEND" == "podman" || "$BACKEND" == "auto" ]]; then
  if podman compose version >/dev/null 2>&1; then
    COMPOSE_CMD="podman compose"
  elif command -v podman-compose >/dev/null 2>&1; then
    COMPOSE_CMD="podman-compose"
  fi
fi

if [[ -z "$COMPOSE_CMD" && ( "$BACKEND" == "docker" || "$BACKEND" == "auto" ) ]]; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  fi
fi

if [[ -z "$COMPOSE_CMD" ]]; then
  log_error "Could not find a valid compose CLI for backend: $BACKEND"
  exit 1
fi

log_success "Compose CLI selected: $COMPOSE_CMD"

# 4. Check Daemon Readiness
ENGINE="docker"
if [[ "$COMPOSE_CMD" == *"podman"* ]]; then
  ENGINE="podman"
fi

log_info "Validating $ENGINE readiness..."
if ! command -v $ENGINE >/dev/null 2>&1; then
  log_error "$ENGINE CLI is not installed or not in PATH."
  exit 1
fi
if ! $ENGINE info >/dev/null 2>&1; then
  log_error "$ENGINE daemon is not running or current user lacks permissions."
  exit 1
fi
log_success "$ENGINE daemon is running and accessible."

# 5. Env file checks (only needed for 'up')
if [[ "$ACTION" == "up" ]]; then
  if [ ! -f ".env" ]; then
    log_warn "No .env file found in root. Checking for .env.example..."
    if [ -f "server/.env.example" ]; then
      cp server/.env.example .env
      log_success "Created .env from server/.env.example. Please review its settings."
    elif [ -f "docker/.env.example" ]; then
      cp docker/.env.example .env
      log_success "Created .env from docker/.env.example. Please review its settings."
    else
      log_error "Could not find any .env or .env.example file. Please create a .env file."
      exit 1
    fi
  else
    log_success ".env configuration file detected."
  fi
  
  log_info "Bringing up the stack in STATIC/TESTING mode (no hot-reloading)..."
  if [ ${#ADDITIONAL_ARGS[@]} -eq 0 ]; then
    exec $COMPOSE_CMD up --build
  else
    exec $COMPOSE_CMD up "${ADDITIONAL_ARGS[@]}"
  fi
else
  log_info "Stopping the stack..."
  exec $COMPOSE_CMD down "${ADDITIONAL_ARGS[@]}"
fi
