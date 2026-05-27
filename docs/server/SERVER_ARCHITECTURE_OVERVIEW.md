# Server Architecture Overview

## 1. Purpose and Scope
This document outlines the high-level architecture of the `server/src/` directory. The server has been refactored from a flat structure into a domain-driven, self-contained modular architecture, mirroring the client application's design. This ensures that each domain controls its routes, services, configs, types, internal utilities, and Model Context Protocol (MCP) tool handlers.

## 2. Non-Goals or Boundary Limits
- Does not cover client-side architecture (see [client-architecture.md](client-architecture.md)).
- Does not cover detailed sub-module implementations like specific AI integrations or KMS envelope encryption (see [kms-security-architecture.md](kms-security-architecture.md)).

## 3. Entry Points
- **HTTP Server**: `server/src/index.ts` and `server/src/app.ts` initialize the Express application and mount the global API router from `server/src/routes/index.ts`.
- **MCP Server**: `server/src/modules/mcp/stdio.ts` provides the standard input/output transport for the Model Context Protocol.

## 4. Flow Steps
1. **Request Reception**: Requests hit `server/src/app.ts` (Express) or `server/src/modules/mcp/stdio.ts` (MCP).
2. **Global Routing**: Express routes are forwarded to `server/src/routes/index.ts`, which mounts sub-routers from individual domain modules.
3. **Module Handling**: Each module (e.g., `src/modules/workspaces/routes.ts`) defines its own REST endpoints and interacts with module-specific services.
4. **Data Persistence**: Modules access PostgreSQL via Drizzle ORM (`server/src/db/index.ts` and `server/src/db/schema.ts`).

## 5. Data Stores and Resources
- **PostgreSQL**: Primary relational datastore configured via `src/db/index.ts`. Shared schemas are defined in `src/db/schema.ts` to prevent circular dependencies.
- **In-Memory/External**: `pg-mem` is used for test environments.

## 6. Interfaces and Contracts
- **REST API**: Exposes `api/v1/*` routes mounted per module.
- **MCP API**: The MCP Router (`src/modules/mcp/router.ts`) dynamically resolves tools like `ticketTools` and `workspaceMemberTools` from their respective domain modules.

## 7. Key Files and Modules
The architecture is structured under `src/modules/`:
- **`auth/`**: Handles authentication compatibility, envelope encryption via KMS, and request actor resolution (`request-auth.ts`).
- **`ai/`**: Connects to AI providers (OpenAI, Anthropic, Gemini, Ollama) and manages system prompts.
- **`tickets/`**: Manages ticket records, comments, and specific MCP tool handlers.
- **`workspaces/`**: Manages workspaces, projects, members, activities, and specific MCP tool handlers.
- **`mcp/`**: The core framework for the Model Context Protocol, including stdio configurations and tool execution dispatchers.
- **`users/`, `settings/`, `health/`, `webhooks/`**: Focused domain sub-routers and handlers.

## 8. Permissions, Guards, or Tenant Boundaries
- **Cross-Domain Dependencies**: Core DB setups (`src/db`) and platform queries (`src/lib/platform.ts`) are shared to prevent circular references.
- **Workspace Authorization**: All ticket and workspace routes/MCP tools enforce strict workspace-level isolation using `resolveRequestActorUserId`.

## 9. Failure Modes, Observability, or Operational Notes
- Modular structure isolates feature failures; an error in the AI module's provider fetch does not impact ticket operations.
- Test environments utilize the `ALLOW_DEV_AUTH_BYPASS` flag in `request-auth.ts` to allow `x-user-id` header impersonation.

## 10. Change Hazards, Invariants, or Migration Constraints
- When adding a new feature, developers must create a new self-contained directory in `src/modules/`.
- Relative imports within modules must use `.js` extensions (NodeNext module resolution).
- Cross-module imports should be minimized; shared logic belongs in `src/lib/`.

## 11. Related Docs
- [SERVER_MODULE_WORKSPACES.md](SERVER_MODULE_WORKSPACES.md)
- [SERVER_MODULE_MCP.md](SERVER_MODULE_MCP.md)
