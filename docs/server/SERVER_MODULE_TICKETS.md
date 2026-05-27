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

## 5. Data Stores and Resources
Owns and mutates the following PostgreSQL tables via Drizzle ORM:
- `tickets`
- `comments`

## 6. Interfaces and Contracts
- **REST**: Strict validation using Zod schemas for all mutation payloads (e.g., ticket status constraints).
- **MCP**: Exposes tools such as `createTicket`, `listTickets`, `readTicketDetails`, `updateTicket`, `createComment`, `readComments`, etc.

## 7. Key Files and Modules
- `routes.ts`: Express router defining all REST interactions.
- `services/tickets.ts`: Reusable database service methods for complex joins (e.g., ticket with assignee, project, domain, cycle).
- `mcp.ts`: Maps the ticket services to the Model Context Protocol constraints, injecting rigorous cross-tenant authorization checks.

## 8. Permissions, Guards, or Tenant Boundaries
- **Project Boundary**: REST APIs strictly demand an `X-Project-Id` header and verify the request actor is a member of that project (`project_members` table).
- **Workspace Boundary**: MCP endpoints verify that the ticket's parent project belongs to the trusted workspace authorized in the MCP connection handshake.

## 9. Failure Modes, Observability, or Operational Notes
- This module does not document or enforce a ticket-specific MCP rate limit; operators should not assume rapid ticket creation via MCP tools is throttled unless that protection is implemented elsewhere.

## 10. Change Hazards, Invariants, or Migration Constraints
- A ticket's `key` (e.g., `PRJ-123`) is immutable and globally unique across the system, derived from the parent project. Modifying project keys does not inherently backport to existing tickets.

## 11. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
- [SERVER_MODULE_WORKSPACES.md](SERVER_MODULE_WORKSPACES.md)
