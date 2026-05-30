#!/usr/bin/env bash

# Use bash strict mode
set -euo pipefail

# Define color helper functions for styling output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

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

log_info "Validating system and Docker readiness..."

# 2. Check if docker is installed
if ! command -v docker >/dev/null 2>&1; then
  log_error "Docker CLI is not installed or not in PATH. Please install Docker."
  exit 1
fi
log_success "Docker CLI detected."

# 3. Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
  log_error "Docker daemon is not running or current user lacks permissions."
  exit 1
fi
log_success "Docker daemon is running and accessible."

# 4. Check docker compose support
COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  log_error "Docker Compose (v2) or docker-compose is not installed."
  exit 1
fi
log_success "Docker Compose CLI detected: $COMPOSE_CMD"

# 5. Check if .env file exists in the root
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

# 6. Execute docker compose up to bring up the entire stack
log_info "Bringing up the entire stack using root docker-compose..."
exec $COMPOSE_CMD up --build "$@"
