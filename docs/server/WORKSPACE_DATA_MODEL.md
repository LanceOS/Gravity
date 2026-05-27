# Workspace Data Model

## 1. Purpose and Scope

This document details the data architecture for Workspaces, Projects, Domains, and Cycles in the Gravity server. It maps the PostgreSQL tables responsible for tenant isolation, organization structure, and team membership.

## 2. Non-Goals or Boundary Limits

- This document does not cover individual Tickets or Comments; those are documented in the Ticket Data Model.
- It does not detail specific external integrations or user settings unless they directly impact workspace membership.

## 3. Entry Points

- **Schema Definition**: `server/src/modules/workspaces/schema.ts`
- **Routes**: `server/src/modules/workspaces/routes.ts`, `server/src/modules/workspaces/projects-routes.ts`

## 4. Flow Steps

1. **Workspace Initialization**: A user creates a Workspace (`workspaces`), becoming the creator and an automatic member (`workspace_members`).
2. **Project Creation**: Within a Workspace, Projects are created (`projects`) representing specific streams of work.
3. **Domain & Cycle Setup**: Inside a Project, Domains (logical grouping) and Cycles (time-bound sprints) are defined (`domains`, `cycles`).
4. **Membership Flow**: Users can be invited to Workspaces (`workspace_invites`, `workspace_join_requests`). Upon approval, they are added to `workspace_members` and subsequently `project_members`.

## 5. Data Stores and Resources

### `workspaces` Table
- **Purpose**: Top-level tenant container.
- **Key Fields**: `id`, `name`, `key`, `workspaceKey`, `hostUrl`.

### `workspace_members` & `workspace_member_activity` Tables
- **Purpose**: Maps users to workspaces with specific roles. Tracks user activity.
- **Key Fields**: `workspaceId`, `userId`, `role`, `lastActiveAt`.

### `workspace_settings` Table
- **Purpose**: Configures workspace behaviors (join modes, disabled tools).
- **Key Fields**: `workspaceId`, `joinMode`, `disabledMcpTools`.

### `workspace_invites` & `workspace_join_requests` Tables
- **Purpose**: Manages the invite system and approval workflows for joining a workspace.

### `projects` Table
- **Purpose**: Sub-containers within a workspace.
- **Key Fields**: `id`, `workspaceId`, `name`, `key`, `inviteCode`.

### `project_members` Table
- **Purpose**: Manages user access specifically at the project level.
- **Key Fields**: `projectId`, `userId`, `role`.

### `domains` & `cycles` Tables
- **Purpose**: Organizational units within a project. `domains` classify work contextually, while `cycles` provide start/end dates for sprints.
- **Key Fields**: `projectId`, `name`, `color` (domains), `startDate`, `endDate` (cycles).

## 6. Interfaces and Contracts

- Exposed through the Drizzle ORM schemas in `server/src/db/schema.ts`.
- Workspace-centric operations rely heavily on composite primary keys (e.g., `workspaceId` + `userId`) to ensure uniqueness and fast lookups for permission checks.

## 7. Key Files and Modules

- `server/src/modules/workspaces/schema.ts`

## 8. Permissions, Guards, or Tenant Boundaries

- **Strict Tenant Boundaries**: The `workspaces` and `projects` tables are the core of tenant isolation. Almost all downstream data (e.g., Tickets) must trace back to a `projectId` and `workspaceId`.
- **RBAC**: `workspace_members.role` and `project_members.role` dictate user capabilities within these boundaries.

## 9. Failure Modes, Observability, or Operational Notes

- Orphaned domains or cycles could occur if projects are force-deleted without cascading logic.

## 10. Change Hazards, Invariants, or Migration Constraints

- Modifying the `workspaceId` or `projectId` foreign key chains poses extreme data corruption risks as it determines tenant isolation.
- `key` fields on `workspaces` and `projects` are uniquely constrained and often used for URL routing or ticket prefixes; changing these rules could break external links or historical references.

## 11. Related Docs

- [Database Architecture Flow](file:///home/lance/Documents/Gravity%20copy/docs/server/DATABASE_ARCHITECTURE_FLOW.md)
- [Ticket Data Model](file:///home/lance/Documents/Gravity%20copy/docs/server/TICKET_DATA_MODEL.md)
