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
1. **Workspace Creation**: A user sends a POST to `/api/v1/workspaces`. The route requires a name/key, creates the workspace and settings, and sets the owner. The workspace initially has no default project.
2. **Project Creation**: Handled via POST `/api/v1/projects`. Validates the project prefix and uniqueness within the workspace, then creates the project record. If no workspace is supplied, the service creates one with the project as its default.
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
- **New project keys**: REST, `createProjectRecord`, and seed creation share `utils/project-key.ts`. Keys must be strings containing one or more ASCII letters or digits after trimming surrounding whitespace; letters are stored uppercase. Control characters are rejected anywhere, including surrounding tabs/newlines. REST returns an actionable 400 for invalid keys. This creation policy does not rename existing projects or tickets.
- **MCP Tool**: `listWorkspaceMembers` returns a normalized roster of members for the authorized workspace context.

## 7. Key Files and Modules
- `routes.ts`: Extensive Express router for workspace administration.
- `projects-routes.ts`: Express router specifically for project boundaries.
- `mcp.ts`: Exports `WorkspaceMemberTools`, tool definitions, and tool handlers for dynamic MCP interaction.
- `schema.ts`: Drizzle ORM table definitions for workspaces, projects, and domains.
- `services/membership.ts`: Abstracted membership verification service (`isWorkspaceMember` and `getProjectWorkspaceId`) for cross-domain usage.
- `utils/project-creation.ts`: Project-key conflict lookup and creation error mapping.
- `utils/project-key.ts`: Shared normalization and validation for new project prefixes.

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
