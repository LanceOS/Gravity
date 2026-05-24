# Gravity

Gravity is an AI-native project management application. It provides workspace-based ticket tracking with built-in support for AI agents via the Model Context Protocol (MCP), browser-native WebMCP tools, and a local Ollama-powered chat assistant. Multiple Gravity instances can be linked together through a federated networking layer, allowing teams running separate deployments to collaborate across workspace boundaries.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Application Flow](#application-flow)
- [AI Tools](#ai-tools)
  - [MCP Server](#mcp-server)
  - [WebMCP Browser Tools](#webmcp-browser-tools)
  - [Local AI Chat (Ollama)](#local-ai-chat-ollama)
- [Federation](#federation)
- [Launching the Application](#launching-the-application)
  - [Production (Docker Compose)](#production-docker-compose)
  - [Development (Vite HMR)](#development-vite-hmr)
  - [Watch Mode (auto-rebuild)](#watch-mode-auto-rebuild)
  - [Standalone Frontend Dev Container](#standalone-frontend-dev-container)
- [Environment Variables](#environment-variables)

---

## Features

- **Workspaces** — Isolated multi-tenant environments, each with its own members, projects, and settings.
- **Projects** — Organise work into named projects; each project owns its own ticket backlog.
- **Tickets** — Create, update, and track tasks with statuses (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`) and priorities (`no_priority`, `low`, `medium`, `high`, `urgent`).
- **Sub-tickets** — Nest tickets under a parent ticket to represent tasks within a larger piece of work.
- **Domains** — Label-like groupings that categorise tickets by area (e.g. frontend, backend, infra).
- **Cycles** — Time-boxed sprints; assign tickets to a cycle to track delivery over a period.
- **Comments** — Threaded comments on individual tickets, with full CRUD support.
- **Members & Roles** — Workspace owners can invite members via invite links or by approving join requests. Role-based access distinguishes owners from regular members.
- **Real-time updates** — The frontend subscribes to a server-sent events (SSE) stream so ticket and workspace changes propagate to all connected clients without a page reload.
- **MCP Agent Tools** — A standard Model Context Protocol endpoint lets external AI assistants read and mutate workspace data. Workspace owners can enable or disable individual tools from the Settings page.
- **WebMCP Browser Tools** — Chromium AI agents running in the same browser tab can interact with the open workspace directly via the browser-native `navigator.modelContext` API.
- **Local AI Chat** — An embedded chat panel connects to a locally running Ollama instance so you can ask questions about your tickets without sending data to a third-party service.
- **Federation** — Connect two Gravity deployments so tickets and comments can be shared across them with cryptographically signed HTTP requests.

---

## Architecture

```
┌─────────────────────────────────┐
│           Browser               │
│  React SPA (Vite · TypeScript)  │
│  port 5173 (nginx in prod)      │
└────────────┬────────────────────┘
             │ HTTP / SSE
┌────────────▼────────────────────┐
│        Express API Server       │
│  Node.js · TypeScript           │
│  port 8080                      │
│                                 │
│  /api/auth     – BetterAuth     │
│  /api/v1       – REST routes    │
│  /api/v1/mcp   – MCP SSE/stdio  │
│  /api/v1/events/subscribe – SSE │
└────────────┬────────────────────┘
             │ SQL (Drizzle ORM)
┌────────────▼────────────────────┐
│         PostgreSQL 16           │
│  port 5432                      │
└─────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, custom component library (`library/`) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Drizzle ORM |
| Auth | BetterAuth (session-based) |
| Containerisation | Docker / Podman Compose |
| AI (local) | Ollama (external, accessed via `host.docker.internal`) |

---

## Application Flow

1. **Sign in / Sign up** — A user lands on the auth screen and either creates an account or signs in. Session cookies are issued by the BetterAuth layer on the API server.

2. **Workspace selection** — After authenticating, the user is shown the Workspace Directory. They can create a new workspace, join an existing one via an invite link, or send a join request that an owner must approve.

3. **Project navigation** — Inside a workspace, the sidebar lists all projects. Selecting a project switches the main panel to show that project's tickets.

4. **Ticket management** — Tickets are displayed in a list or board view. Filters (status, priority, domain, cycle, assignee) narrow the visible set. Clicking a ticket opens a detail panel showing the description, sub-tickets, and comment thread. Tickets can be created from the `+` button in the header or by dragging columns on the board.

5. **Cycles and Domains** — Domains group tickets by technical area; cycles represent time-boxed iterations. Both are managed per-project and can be assigned to any ticket.

6. **Settings** — Workspace owners access the Settings page to manage members, configure join policy, create invite links, and enable or disable individual MCP agent tools.

7. **AI Interaction** — AI agents connect through MCP (external) or WebMCP (in-browser) to read and modify tickets autonomously. The local Ollama chat panel provides a conversational interface scoped to the active workspace.

---

## AI Tools

### MCP Server

Gravity exposes a [Model Context Protocol](https://modelcontextprotocol.io) endpoint that external AI agents (e.g. Claude Desktop, Cursor) can connect to. The server supports both SSE and stdio transports.

**SSE endpoint:** `GET /api/v1/mcp/sse`

Authentication requires an active session (`x-user-id` header or cookie) and an `X-Workspace-Id` header identifying the target workspace.

**Available tools:**

| Tool | Description |
|---|---|
| `list_tickets` | List tickets with optional filters (status, priority, project, domain, cycle, assignee). |
| `get_ticket_details` | Fetch full details of a ticket by its unique key (e.g. `PROJ-42`). |
| `create_ticket` | Create a new ticket or sub-ticket in a project. |
| `update_ticket` | Update title, description, status, priority, assignee, domain, cycle, or PR metadata. |
| `list_workspace_members` | List all members of the workspace with their roles and last-active times. |
| `create_comment` | Post a new comment on a ticket. |
| `read_comments` | Read all comments on a ticket. |
| `update_comment` | Edit the body of an existing comment. |
| `delete_comment` | Delete a comment from a ticket. |

Workspace owners can enable or disable any tool from **Settings → MCP Tools**.

### WebMCP Browser Tools

For Chromium-based browsers (Chrome ≥ 146, Edge) with the `#enable-webmcp-testing` flag enabled, Gravity registers tools directly with the browser's built-in `navigator.modelContext` API. This lets a browser AI agent interact with the currently open workspace tab without any extra configuration.

To enable the flag, navigate to `chrome://flags` (or `edge://flags`) and search for `enable-webmcp-testing`, then set it to **Enabled** and relaunch the browser.

Registered browser tools:

| Tool | Description |
|---|---|
| `list-tickets` | Return the tickets loaded in the current workspace tab. |
| `create-ticket` | Create a ticket in the active workspace. |
| `update-ticket` | Modify an existing ticket by database ID. |
| `add-comment` | Post a comment on a ticket. |

Tools are registered when the app mounts and automatically cleaned up via `AbortController` when the component unmounts.

### Local AI Chat (Ollama)

The toolbar contains a chat button that opens an embedded panel backed by a locally running [Ollama](https://ollama.com) instance. No data leaves your machine. The Ollama endpoint defaults to `http://host.docker.internal:11434` inside Docker and can be overridden with the `OLLAMA_DEFAULT_ENDPOINT` environment variable.

---

## Federation

Federation allows two independent Gravity deployments to share tickets and comments with each other. Connections are established by an owner exchanging a federation invite between the two instances. Once connected, ticket and comment events are pushed to peer instances using HTTP POST requests signed with Ed25519 keys. Each node verifies the signature and timestamp of incoming requests before applying changes, preventing replay attacks.

---

## Launching the Application

All Docker Compose files live in the `docker/` directory. Commands below use `docker compose`; replace with `podman compose` if you are using Podman.

### Production (Docker Compose)

Starts PostgreSQL, the API server, and an nginx container serving the built frontend.

```bash
docker compose -f docker/docker-compose.yml up -d
```

| Service | Default host port |
|---|---|
| Frontend (nginx) | `5173` |
| Backend (API) | `8080` |
| PostgreSQL | `5432` |

To stop:

```bash
docker compose -f docker/docker-compose.yml down
```

To rebuild images after a code change:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

### Development (Vite HMR)

Replaces the production nginx frontend container with a Vite dev server so changes to `client/` are reflected instantly without rebuilding the image.

```bash
# Podman (recommended)
podman compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

# Docker
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d
```

The dev frontend is available at `http://localhost:5173`. To stop:

```bash
podman compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml down
```

> **Note:** The dev Compose override mounts `client/` and `library/` into the container and runs `npm run dev`. Make sure `client/node_modules` exists on the host before starting (`npm install` inside `client/`).

### Watch Mode (auto-rebuild)

Keeps the production-style nginx frontend container up to date by automatically rebuilding images whenever source files in `server/`, `client/`, or `library/` change.

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.watch.yml up -d
docker compose -f docker/docker-compose.yml -f docker/docker-compose.watch.yml watch
```

Run `watch` in a second terminal and leave it attached.

### Standalone Frontend Dev Container

If you only want to run the Vite dev server in a container while the backend runs elsewhere:

```bash
podman rm -f gravity_frontend_dev_run || true
podman run -d --rm --userns=keep-id --name gravity_frontend_dev_run \
  -p 5173:5173 \
  -v "$(pwd)/client":/app/client:Z \
  -v "$(pwd)/library":/app/library:Z \
  -v "$(pwd)/client/node_modules":/app/client/node_modules:Z \
  -w /app/client node:20-slim \
  sh -c "npm run dev -- --host 0.0.0.0 --port 5173"
```

On some systems you may need to adapt the volume flags (`:Z`, `:z`) or file ownership to allow the container to read the mounted files.

---

## Environment Variables

The API server is configured through environment variables. Copy `server/.env.example` to `server/.env` to get started with local (non-Docker) development.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Port the API server listens on. |
| `DATABASE_URL` | — | PostgreSQL connection string. |
| `BETTER_AUTH_SECRET` | — | Secret key for signing auth sessions. **Change before deploying to production.** |
| `BETTER_AUTH_BASE_URL` | `http://localhost:8080` | Public URL of the API server (used in auth redirects). |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins. |
| `TRUSTED_ORIGINS` | `http://localhost:5173,http://localhost:8080` | Comma-separated list of trusted origins for cookie handling. |
| `OLLAMA_DEFAULT_ENDPOINT` | `http://host.docker.internal:11434` | Base URL of the Ollama API used for local AI chat. |
| `FEDERATION_SYNC_INTERVAL_MS` | `5000` | How often (ms) to sync federated connections. |
| `FEDERATION_SYNC_FAILURE_BASE_MS` | `5000` | Initial back-off delay after a federation sync failure. |
| `FEDERATION_SYNC_FAILURE_MAX_MS` | `60000` | Maximum back-off delay for repeated federation sync failures. |
| `FEDERATION_SYNC_FAILURE_MAX_RETRIES` | `5` | Maximum consecutive failures before a federation connection is marked as errored. |

The Docker Compose files in `docker/` accept the following shell environment variables to override default port bindings and container names:

| Variable | Default |
|---|---|
| `GRAVITY_POSTGRES_PORT` | `5432` |
| `GRAVITY_BACKEND_PORT` | `8080` |
| `GRAVITY_FRONTEND_PORT` | `5173` |
| `GRAVITY_POSTGRES_CONTAINER` | `gravity_postgres` |
| `GRAVITY_BACKEND_CONTAINER` | `gravity_app_server` |
| `GRAVITY_FRONTEND_CONTAINER` | `gravity_frontend` |
| `GRAVITY_BACKEND_PUBLIC_URL` | `http://localhost:8080` |
| `GRAVITY_FRONTEND_PUBLIC_URL` | `http://localhost:5173` |
