# Local Development Environment

## Purpose and Scope
This document outlines the local development setup for the Gravity stack using containerization. It explains the core shell scripts (`dev.sh`, `local-ci.sh`), the environment file loading order, and container management workflows.

## Non-Goals or Boundary Limits
- This document does not cover building the production images or CI/CD publishing workflows (see [DOCKER_IMAGE.md](../DOCKER_IMAGE.md)).
- It does not map the internal database container configurations or internal docker networks (see [DOCKER_ORCHESTRATION.md](DOCKER_ORCHESTRATION.md)).

## Entry Points
### The `dev.sh` Script
The primary entry point for managing the local development stack is `dev.sh` in the project root. This script auto-detects your system's container tooling (Docker Compose vs. Podman Compose) and spins up the stack safely.

**Usage:**
```bash
./dev.sh start        # Auto-detects available engine and starts stack
./dev.sh stop         # Tears down the stack

# Specific engine targeting:
./dev.sh start podman # Forces podman-compose
./dev.sh stop docker  # Forces docker-compose
```

**What it does:**
1. **Parses arguments**: Captures explicit user intentions for action (`start`/`stop`) and engine (`docker`/`podman`/`auto`). Any remaining flags (e.g. `-d`) are safely forwarded to the underlying compose CLI.
2. **Detects tooling**: Automatically verifies the readiness of the selected container engine and its background daemon process.
3. **Validates Configuration**: Verifies the presence of a root `.env` file. If none exists, it generates one safely by copying a template (`.env.example`).
4. **Bootstraps the Stack**: Invokes the appropriate `compose` command utilizing `docker-compose.yml` to orchestrate all services.

## Interfaces and Contracts
### Environment Variables (`.env`)
The stack relies heavily on environment inheritance. Both `dev.sh` and the container engines natively read from `.env` in the repository root.

**Important Podman Quirk:**
`podman-compose` automatically loads the `.env` file into the container instances, allowing `.env` declarations to directly overwrite the `environment` mappings laid out in `docker-compose.yml`. For this reason, `DATABASE_URL` and `REDIS_URL` in the `.env` file **must** point to their internal Docker DNS names (e.g. `@postgres:5432`) rather than `localhost`.

### `local-ci.sh`
The `./scripts/local-ci.sh` executes the local continuous integration smoke testing. It behaves similarly to `dev.sh` by automatically detecting `podman compose` and `docker-compose` and executing npm builds, unit tests, and verifying API health check endpoints proxying from the frontend to the backend.

## Key Files and Modules
- `dev.sh`: Primary bootstrap wrapper.
- `scripts/local-ci.sh`: Automation script for test orchestration.
- `.env.example`: The root example file containing boilerplate settings and internal Docker routing strings.
- `server/.env.example`: Server-specific boilerplate variables logic mapping.

## Failure Modes, Observability, or Operational Notes
- **Missing CLI/Daemon**: The `dev.sh` script will fail immediately with a red `[ERROR]` tag if the expected container engine (`docker` or `podman`) is not running.
- **`ECONNREFUSED` on Databases**: If developers run the server bare-metal via `npm run dev` locally while utilizing the `.env` file containing `postgres:5432` routing, Node.js will fail to resolve the host. This configuration is exclusively designed for the containerized stack. Bare-metal development is strongly discouraged as database ports are strictly isolated (see Orchestration docs).
