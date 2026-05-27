# Ticket Data Model

## 1. Purpose and Scope

This document details the data architecture for Tickets and Comments in the Gravity server. It maps the PostgreSQL tables responsible for tracking individual work items, their states, assignments, and conversation history.

## 2. Non-Goals or Boundary Limits

- This document does not cover project management concepts like Cycles or Domains beyond their foreign key relationships to tickets.
- It does not cover the realtime event emission flow (e.g., WebSockets triggering on ticket creation).

## 3. Entry Points

- **Schema Definition**: `server/src/modules/tickets/schema.ts`
- **Routes**: `server/src/modules/tickets/routes.js`

## 4. Flow Steps

1. **Ticket Creation**: A ticket is created (`tickets`) within a specific `projectId`. It can optionally be assigned to a `domainId`, `cycleId`, or `assigneeId`.
2. **Comment Addition**: Users can add conversation items to a ticket, inserting records into `comments` referencing the `ticketId`.
3. **Ticket Mutability**: The ticket moves through states (`status`), priorities (`priority`), and handles pull request statuses (`prStatus`, `prUrl`).

## 5. Data Stores and Resources

### `tickets` Table
- **Purpose**: Primary representation of a work item or task.
- **Created By**: User action or automated integrations.
- **Mutated By**: Users updating status, assignments, or PR activity.
- **Key Fields**: 
  - `id`, `key` (Unique human-readable identifier, e.g., GRAV-123).
  - `title`, `description`, `status`, `priority`.
  - Foreign Keys: `projectId`, `assigneeId`, `domainId`, `cycleId`, `parentId` (For subtasks).
  - Integration state: `prStatus`, `prUrl`.

### `comments` Table
- **Purpose**: Represents communication logs on a ticket.
- **Created By**: User input.
- **Key Fields**: `id`, `ticketId`, `userId`, `body`.

## 6. Interfaces and Contracts

- Registered in `server/src/db/schema.ts` for Drizzle ORM access.
- Indices are heavily used on foreign keys (`projectIdIdx`, `assigneeIdIdx`, etc.) to ensure fast lookups on list views and dashboards.

## 7. Key Files and Modules

- `server/src/modules/tickets/schema.ts`

## 8. Permissions, Guards, or Tenant Boundaries

- The core tenant boundary is enforced by the `projectId` on the `tickets` table. All queries for tickets must restrict results based on the `projectId` that the active user is authorized to access.
- `comments` depend entirely on their parent `ticketId` for access control.

## 9. Failure Modes, Observability, or Operational Notes

- Deeply nested tickets (using `parentId`) could cause performance degradation in recursive queries if nesting limits are not enforced in the application logic.

## 10. Change Hazards, Invariants, or Migration Constraints

- The `key` field on `tickets` must remain unique globally or at least within a workspace/project scope, as it is the primary human-facing identifier.
- Removing a domain or cycle must account for tickets that reference them; they should either nullify the reference or prevent deletion if tickets are attached.

## 11. Related Docs

- [Workspace Data Model](WORKSPACE_DATA_MODEL.md)
- [Database Architecture Flow](DATABASE_ARCHITECTURE_FLOW.md)
