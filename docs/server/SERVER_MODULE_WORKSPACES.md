# Server Workspaces Module

## 1. Purpose and Scope
The `workspaces` module (`server/src/modules/workspaces/`) encapsulates the domains of Workspaces and Projects. It manages the lifecycle, membership, activity, and join requests for workspaces, as well as the creation and configuration of projects nested within them. It also provides workspace-specific Model Context Protocol (MCP) handlers.

## 2. Non-Goals or Boundary Limits
- Does not handle ticket assignment logic (see [SERVER_MODULE_TICKETS.md](SERVER_MODULE_TICKETS.md)).
- Core user profile configuration is delegated to the `users` module.

## 3. Entry Points
- **REST Routes**: `src/modules/workspaces/routes.ts` (for `/api/v1/workspaces/*`) and `src/modules/workspaces/projects-routes.ts` (for `/api/v1/projects/*`).
- **MCP Endpoints**: `src/modules/workspaces/mcp.ts` defines the `WorkspaceMemberTools` class for MCP operations.

## 4. Flow Steps
1. **Workspace Creation**: A user sends a POST to `/api/v1/workspaces`. The route logic validates the name/key, creates the workspace, auto-creates a default project using `project-creation.ts` utilities, and sets the owner.
2. **Project Creation**: Handled via POST `/api/v1/projects`. Validates the project key uniqueness, creates the project record, and maps domains/cycles.
3. **Membership & Invites**: Members can be invited via unique invite codes. The system processes join requests, allowing workspace owners to approve or reject them.

## 5. Data Stores and Resources
Owns and mutates the following PostgreSQL tables via Drizzle ORM, defined locally in `src/modules/workspaces/schema.ts` and re-exported centrally:
- `workspaces`
- `workspace_settings`
- `workspace_members`
- `workspace_member_activity`
- `workspace_invites`
- `workspace_join_requests`
- `projects`
- `project_members`
- `domains`
- `cycles`

## 6. Interfaces and Contracts
- **REST APIs**: `GET /api/v1/workspaces`, `POST /api/v1/workspaces`, `POST /api/v1/projects`, etc.
- **MCP Tool**: `listWorkspaceMembers` returns a normalized roster of members for the authorized workspace context.

## 7. Key Files and Modules
- `routes.ts`: Extensive Express router for workspace administration.
- `projects-routes.ts`: Express router specifically for project boundaries.
- `mcp.ts`: Exports `WorkspaceMemberTools`, tool definitions, and tool handlers for dynamic MCP interaction.
- `schema.ts`: Drizzle ORM table definitions for workspaces, projects, and domains.
- `services/membership.ts`: Abstracted membership verification service (`isWorkspaceMember` and `getProjectWorkspaceId`) for cross-domain usage.
- `utils/project-creation.ts`: Domain-specific utility for scaffolding default project resources (domains, cycles).

## 8. Permissions, Guards, or Tenant Boundaries
- **Strict Tenancy**: Operations require `resolveRequestActorUserId` verification. Workspace routes explicitly check that the actor has the required role (e.g., `owner` for deletions) in the `workspace_members` table.
- **Cross-Tenant Prevention**: Operations strictly filter by the verified `workspaceId`. External domains (like tickets and MCP) consume the `services/membership.ts` abstractions to guarantee isolated tenancy.

## 9. Failure Modes, Observability, or Operational Notes
- Validates the uniqueness of `workspaceKey` and `projectKey` upon creation, returning structured 409 Conflict errors if a collision occurs.

## 10. Change Hazards, Invariants, or Migration Constraints
- `projectKey` and `workspaceKey` are deeply coupled to the `tickets` module and routing paths. Changing the normalization rules for these keys can break cross-module links.

## 11. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
- [SERVER_MODULE_TICKETS.md](SERVER_MODULE_TICKETS.md)
- [GITHUB_INTEGRATION.md](GITHUB_INTEGRATION.md)
