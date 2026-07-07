# Ticket Relationships System

The Ticket Relationships System provides a robust mechanism for tracking and enforcing multi-ticket dependencies. Unlike a basic self-referential foreign key, the architecture supports complex, multi-level graph relationships while explicitly defending against cyclic dependencies.

## 1. Database Schema

All ticket dependency relationships are stored in the `ticket_relationships` junction table (`server/src/modules/tickets/schema.ts`).

### `ticket_relationships` Structure

*   **`ticket_id` (PK, FK)**: The ticket that is doing the blocking (the Blocker).
*   **`blocked_ticket_id` (PK, FK)**: The ticket that is blocked (the Dependent).
*   **`project_id`**: For logical bounding and event scoping.
*   **`created_at`**: Audit and chronological ordering.

> [!NOTE]
> In Gravity, if Ticket A blocks Ticket B, it means Ticket B depends on Ticket A. The `ticket_relationships` schema natively models the directional constraint `A -> B`, meaning "A is a blocker for B".

### Legacy vs Current Architecture
Historically, relationships were handled via a single `blockedTicketId` column on the `tickets` table. This only permitted a 1-to-many relationship (a ticket could only have one blocker). The migration to a dedicated `ticket_relationships` junction table allows for robust Many-to-Many configurations (a ticket can be blocked by multiple tickets, and block multiple tickets).

Older dumps created before the rename to `ticket_relationships` may still contain a `ticket_dependencies` table or a legacy `tickets.blocked_ticket_id` column. The server bootstrap migrates both forms forward during startup, so restored backups can be normalized without manual SQL edits.

---

## 2. API Endpoints

Ticket relationships can be managed via explicit API routes located in `server/src/modules/tickets/routes.ts`:

### Add a Dependency (Ticket B depends on Ticket A)
`POST /api/v1/tickets/:ticketId/dependencies`
**Body:** `{ dependencyId: string }`
*   **Action:** Marks `dependencyId` (Ticket A) as a blocker of `ticketId` (Ticket B).
*   **Status Codes:**
    *   `201 Created`
    *   `400 Bad Request` if duplicate or cycle detected.
    *   `404 Not Found` if either ticket does not exist.

### Add a Blocker (Ticket A blocks Ticket B)
`POST /api/v1/tickets/:ticketId/blockers`
**Body:** `{ blockerId: string }`
*   **Action:** Marks `blockerId` (Ticket A) as a blocker of `ticketId` (Ticket B).
*   **Status Codes:**
    *   `201 Created`
    *   `400 Bad Request` if duplicate or cycle detected.
    *   `404 Not Found` if either ticket does not exist.

### Remove Relationships
*   `DELETE /api/v1/tickets/:ticketId/dependencies/:dependencyId`
*   `DELETE /api/v1/tickets/:ticketId/blockers/:blockerId`

---

## 3. Validation & Cycle Detection

To prevent graph resolution errors and logical paradoxes, rigorous validation is enforced before any dependency is written to the database.

### 1. Self-Reference Check
A ticket cannot block itself, nor can it depend on itself.
```typescript
if (dependencyId === ticket.id) {
  // Reject
}
```

### 2. Immediate Reverse Relation (1-Hop Cycle)
If an edge already exists where Ticket A blocks Ticket B, adding a reverse edge (Ticket B blocks Ticket A) is an immediate 1-hop circular dependency and is rejected. 

### 3. Deep Circular Dependency Checking
For deep recursive checking (e.g., A -> B -> C -> A), Gravity leverages a deep graph traversal function: `hasCircularDependency(targetBlockerId, startBlockedId)`.

> [!IMPORTANT]
> Because Gravity operates both against production PostgreSQL databases and in-memory `pg-mem` mock databases for integration testing, cycle detection utilizes dual strategies.

**A. PostgreSQL Implementation (`WITH RECURSIVE`)**
In the production environment, Gravity relies on PostgreSQL's extremely fast Common Table Expressions (CTE).
```sql
WITH RECURSIVE bfs AS (
  SELECT blocked_ticket_id FROM ticket_relationships WHERE ticket_id = ${targetBlockerId}
  UNION
  SELECT tr.blocked_ticket_id
  FROM ticket_relationships tr
  INNER JOIN bfs b ON tr.ticket_id = b.blocked_ticket_id
)
SELECT 1 FROM bfs WHERE blocked_ticket_id = ${startBlockedId} LIMIT 1;
```
This efficiently delegates the graph-search traversal directly to the database engine.

**B. pg-mem Test Fallback (In-Memory BFS)**
Because `pg-mem` does not fully support `WITH RECURSIVE` complex subqueries, errors thrown during the cycle check execution are gracefully caught. If running in the `NODE_ENV=test` environment, the query engine dynamically falls back to an application-side Javascript Breadth-First Search (BFS).
This ensures 100% test coverage stability across the relationship models while retaining top performance in production.
