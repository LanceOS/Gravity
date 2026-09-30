# Ticket subtree deletion

`deleteTicketRecord` is currently a permanent deletion operation. REST and MCP
callers authorize the root project before calling it with that project ID. It
locks the source project before ticket rows, matching creation and hierarchy writes,
then rechecks the root project after waiting. It locks the root and discovers and locks every descendant in the same transaction.
A missing root or project mismatch returns false. A descendant in another project
rejects the entire operation, including legacy cross-workspace edges. Cycles are
visited once. Deleting a nested subtree preserves its ancestors and siblings.

All subtree comments (including automation metadata), label assignments, and
incoming/outgoing blocker relationships are removed atomically with the tickets.
Label definitions and surviving tickets are preserved. Existing GitHub automation
references cascade with ticket deletion. Ticket number counters are preserved.
Any failure rolls back the entire operation. The effects variant returns every
deleted ticket ID, key, and project. REST and MCP publish this batch as
`ticket.deleted`; REST also returns it for initiating clients without a realtime
connection. Clients remove descendant detail/comment caches and invalidate
surviving hierarchy/dependency snapshots. Oversized SSE batches use the existing
`resync-required` fallback. The boolean service wrapper remains compatible.

Parent references use NO ACTION, never cascading across an authorization boundary.
Comments and label assignments cascade on physical ticket deletion. Parent row
locks plus foreign keys prevent concurrent writes from leaving new children or
dependent content behind. Application hierarchy writes serialize on project locks. Direct SQL/import writes
can still deadlock against row locks; PostgreSQL aborts one transaction without
partial cleanup, and callers may retry. Bootstrap installs these constraints as
NOT VALID on existing PostgreSQL tables to retain pre-existing orphan data for
explicit repair; new references and deletions are still enforced. Readiness schema
version 3 requires this bootstrapped contract. Fresh Drizzle
schemas use validated constraints. No automatic legacy data deletion is performed.

## Recoverable deletion integration (GRAV-236)

GRAV-236 owns trash, retention, and restore; these do not exist yet. Its soft-delete
path must retain every row in this complete subtree and its comments, label
assignments, and both directions of relationships under one deletion batch. It
must use the same transactional authorization/boundary checks. Do not call this
physical deletion operation when moving a ticket to trash. Reserve it for the
retention purge after the recovery window, preserving ticket number counters.
Restore must retain original IDs and keys, restore parent rows before children
(or in one statement), and insert dependent rows only after tickets. It must
validate project access and surviving relationship endpoints before
reactivating the batch. Client restore must clear the session deletion markers
used to suppress late save callbacks for physically deleted IDs. Tests must include descendant comments/automation metadata,
labels, hierarchy links, external relationships, and partial-failure rollback.

## Validation

Run `DATABASE_URL=postgres://.../gravity_ticket_subtrees_test_<suffix> npx tsx
server/scripts/test-ticket-subtrees-postgres.ts` from the repository root against
an empty, disposable native PostgreSQL database. The script refuses other database
names and nonempty databases, and supplies synthetic secrets. It covers hierarchy,
dependent content, authorization boundaries, failure rollback, legacy cycles,
foreign keys, concurrent dependent writes/reparenting/project moves, move-before-delete
authorization, and non-destructive legacy migration/bootstrap.
The pg-mem bootstrap omits the parent self-reference because its TRUNCATE CASCADE
implementation recurses indefinitely; PostgreSQL is required for integrity and
concurrency validation.
