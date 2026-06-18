# Server Tickets Module

## 1. Purpose and Scope
The `tickets` module (`server/src/modules/tickets/`) manages the core unit of work in the system: tickets. It handles the creation, state transitions, retrieval, and commenting of tickets within a project boundary. It also provides ticket-specific MCP handlers for agentic interactions.

## 2. Non-Goals or Boundary Limits
- Does not manage project or domain hierarchies directly (see [SERVER_MODULE_WORKSPACES.md](SERVER_MODULE_WORKSPACES.md)).
- Relies on the `workspaces` module's schemas for referencing project IDs.

## 3. Entry Points
- **REST Routes**: `src/modules/tickets/routes.ts` mounts on `/api/v1/tickets`.
- **Services Layer**: `src/modules/tickets/services/tickets.ts` contains database abstractions.
- **MCP Endpoints**: `src/modules/tickets/mcp.ts` defines the `TicketTools` class for agent interactions.

## 4. Flow Steps
1. **Creation**: POST `/api/v1/tickets` creates a new ticket. The router enforces project membership checks using the `X-Project-Id` header.
2. **Querying**: GET `/api/v1/tickets` fetches ticket lists via the service abstraction `listTickets`, aggregating sub-tickets and associated domain references.
3. **Commenting**: POST `/api/v1/tickets/:id/comments` persists a comment associated with a specific ticket ID.
4. **Agent Action**: Agents connect via MCP and use `listTickets` or `createTicket` tools exposed by `src/modules/tickets/mcp.ts`. The tools implicitly verify workspace boundaries using the MCP context.
5. **Realtime Sync**: Ticket mutations publish typed events to `mcpEventBus`. The SSE layer uses those events to refresh only the affected ticket detail or comment thread on connected clients.

### Mutation to Event Map

- `create_ticket` -> `ticket.created`
- `update_ticket` -> `ticket.updated`
- `delete_ticket` -> `ticket.deleted`
- `create_comment` / `add_comment` -> `comment.added`
- `update_comment` -> `comment.updated`
- `delete_comment` -> `comment.deleted`
- `add_ticket_labels` -> `labels.added`
- `remove_ticket_labels` -> `labels.removed`
- `set_ticket_labels` -> `labels.set`
- `add_dependency` -> `dependency.added`
- `remove_dependency` -> `dependency.removed`

## 5. Data Stores and Resources
Owns and mutates the following PostgreSQL tables via Drizzle ORM, defined locally in `src/modules/tickets/schema.ts` and re-exported centrally:
- `tickets`
- `comments`

## 6. Interfaces and Contracts
- **REST**: Route handlers enforce project scoping and membership checks via the `X-Project-Id` header; request validation is route-specific and should not be assumed to be uniformly enforced by Zod for all mutation payloads.
- **MCP**: Exposes tools such as `createTicket`, `listTickets`, `readTicketDetails`, `updateTicket`, `createComment`, `readComments`, etc.
- **Realtime events**: Mutation handlers should publish the matching typed SSE event so the client can stay in sync without a refresh.

## 7. Key Files and Modules
- `routes.ts`: Express router defining all REST interactions.
- `services/tickets.ts`: Reusable database service methods for complex joins (e.g., ticket with assignee, project, domain, cycle).
- `mcp.ts`: Exports `TicketTools`, tool definitions, and tool handlers for dynamic MCP interaction, injecting rigorous cross-tenant authorization checks.
- `schema.ts`: Drizzle ORM table definitions for tickets and comments.
- `mcpEventBus`: Consumed by the realtime service to broadcast ticket mutations.

## 8. Permissions, Guards, or Tenant Boundaries
- **Project Boundary**: REST APIs strictly demand an `X-Project-Id` header and verify the request actor is a member of that project (`project_members` table).
- **Workspace Boundary**: MCP and generic REST endpoints verify that the ticket's parent project belongs to the trusted workspace authorized in the connection handshake, utilizing the `isWorkspaceMember` service to decouple domain logic.
- **Realtime Boundary**: Only workspace members should receive SSE updates for that workspace; the realtime layer must not leak ticket changes across tenant boundaries.

## 9. Failure Modes, Observability, or Operational Notes
- **Rate Limiting**: To prevent abuse from agentic clients, the `createTicket` MCP tool enforces a strict rate limit of 1 ticket per 3 seconds per actor.

## 10. Change Hazards, Invariants, or Migration Constraints
- A ticket's `key` (e.g., `PRJ-123`) is immutable and globally unique across the system, derived from the parent project. Modifying project keys does not inherently backport to existing tickets.
- If you add a new ticket mutation and do not emit a corresponding event, the UI will remain stale until a manual refresh.

## 11. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
- [SERVER_MODULE_WORKSPACES.md](SERVER_MODULE_WORKSPACES.md)
- [MCP_FLOW.md](../mcp/MCP_FLOW.md)
