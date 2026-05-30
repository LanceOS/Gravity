# Docker Orchestration Architecture

## Purpose and Scope
This document outlines the structural composition, networking, and data ownership rules of the containerized Gravity stack. It explains the separation between the application layer and the persistent database layer, and details security boundaries within the internal networks.

## Non-Goals or Boundary Limits
- This document does not cover CI/CD image builds or Docker publishing (see [DOCKER_IMAGE.md](../DOCKER_IMAGE.md)).
- It does not detail shell scripts used for booting the development workflow (see [LOCAL_DEV_ENVIRONMENT.md](LOCAL_DEV_ENVIRONMENT.md)).

## Structural Overview
The orchestration is modularized into two primary domains, although all components are managed through the root `docker-compose.yml` during standard execution.

1. **Root Orchestrator (`/docker-compose.yml`)**: Unifies the frontend, backend, and database layers into a cohesive run cycle, managing network links and startup sequencing.
2. **Isolated Database Layer (`/server/docker-compose.yml`)**: Strictly declares the underlying persistence components (PostgreSQL and Redis). This modular file ensures the database layer can be iterated or tested independently of the application components.

## Flow Steps
### Boot Sequence
1. The `dev.sh` wrapper parses `.env` to load environment overrides.
2. `postgres` and `redis` boot and mount their respective volumes (`gravity_postgres_data` and internal anonymous volumes).
3. Compose triggers health checks on both `postgres` and `redis`.
4. `backend` blocks startup until both data services successfully clear their health checks.
5. `frontend` boots up and initializes its reverse proxy.

## Data Stores and Resources
| Container | Type | Volumes | Internal Address | Host Exposure |
|---|---|---|---|---|
| `postgres` | PostgreSQL 16 | `gravity_postgres_data` | `postgres:5432` | **NONE** |
| `redis` | Redis 7 | none (ephemeral) | `redis:6379` | **NONE** |

## Interfaces and Contracts
### Container Networking
We implement multiple private bridge networks to segment container traffic and maintain strict blast radii:
- `gravity_backend_db_redis`: Connects the `backend`, `postgres`, and `redis` containers. The frontend has absolutely no access to this subnet.
- `gravity_frontend_backend`: Connects the `frontend` and `backend` containers exclusively. 

### Security and Port Exposure Boundary
- **Backend & Databases**: Explicitly isolated. The `backend`, `postgres`, and `redis` services do **not** use port mappings (e.g. no `ports: ["5432:5432"]`). Their interfaces are only accessible within the Docker bridge subnets.
- **Frontend**: The `frontend` acts as the sole ingress point into the cluster. It maps the local host port `5173` to its internal container port `5173`. Any communication required with the `backend` is proxied upstream by the frontend engine.

## Change Hazards, Invariants, or Migration Constraints
- **Do not expose database ports**: Exposing `5432` or `6379` on the host violates the security boundary and re-opens attack surfaces that have been deliberately sealed.
- **NodeNext ES Resolution**: The `backend` container builds require fully resolved imports due to `NodeNext` constraints in `tsconfig.json`. Modifying database initialization scripts requires rigorous TypeScript testing.
- **Root `.env` Dominance**: Any `environment` block specified inside `docker-compose.yml` serves merely as a fallback template. Developers must recognize that `.env` files dynamically rewrite container configuration values during runtime bootstrapping, overriding `docker-compose.yml` keys (specifically prevalent in `podman-compose`).
