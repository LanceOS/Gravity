# Durable ticket numbers

Ticket creation (REST, MCP, and service/batch callers) allocates a number inside
its creation transaction using one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
on `ticket_key_counters`. The allocator does three bounded statements: an indexed
project lookup, a compatible `ROW EXCLUSIVE` table lock on tickets, and a counter
upsert. It never scans or returns the project's tickets. PostgreSQL locks
the counter row, so simultaneous writers serialize without duplicate-key retries.
The ticket and counter change commit or roll back together. Numbers from failed,
uncommitted creations may be allocated again; committed identities are retained.

Counters use the normalized **key prefix**, not project ID. `tickets.key` is
globally unique, while different workspaces may have projects with the same
prefix. Those projects share a sequence. Counters have no project foreign key:
deleting a ticket, deleting/recreating a project, moving tickets, or changing a
project's prefix must not reset an old prefix's high water mark. Values are
PostgreSQL bigint and are formatted without conversion to JavaScript Number.
At the bigint maximum (9223372036854775807), creation fails atomically rather
than wrapping or rounding a key.

Schema version 2 bootstraps the counter table, backfills maxima from numeric
suffixes of **all existing ticket keys**, and installs a PostgreSQL `BEFORE`
trigger that advances the counter for explicit-key seed/import inserts and key
updates. The trigger writes only the counter table, so it does not recurse. The
backfill uses the key's exact prefix, including moved tickets and legacy empty
or unusual prefixes; it does not interpret prefix characters as SQL patterns.
Re-running it only raises counters. All key writers acquire the tickets table lock before a
counter lock. A migration transaction takes a conflicting table lock while
backfill and trigger installation run. This prevents a migration from holding
tickets while a creator holds the counter and waits to insert. Compatible
writer table locks do not serialize unrelated prefixes. Drain application
writers during the upgrade; old binaries still allocate outside the transaction.
This migration does a scan at startup, not on each creation. Backups/restores must include the counter table.
Never truncate counters or reset them as part of application cleanup.

No durable key history existed before this change. Keys deleted **before the
upgrade** cannot be recovered from the current database. If an older backup or
external audit identifies a higher historical suffix, raise that prefix's
`last_value` to at least that suffix before enabling writes. Do not lower it.
Explicit imports should preserve their intended identities and must not assign
previously used keys to unrelated tickets. Importing an explicitly chosen key
that another transaction already allocated can correctly fail uniqueness; it
must not deadlock the allocator. `BEFORE` reservation ensures the import waits
for the counter before inserting the unique key.

## Checks without Docker

The standard pg-mem suite covers serial allocation, deletion, and backfill. It
does not model PostgreSQL row locks, rollback, or triggers. The real PostgreSQL
regression script covers a fresh counter under 20 simultaneous writes and 36
concurrent mixed REST/MCP/service batch writes, shared prefixes across workspaces, bigint precision, backfill of moved keys,
rollback after insertion, imports, deletion/recreation, repeated migration, and
bounded allocator queries before/after 10,000 tickets. It also checks the actual
upsert execution plan uses the counter primary key with one conflicting row.
Deterministic gates observe real PostgreSQL lock waits during migration, explicit
import, rollback, and project-prefix changes. They also check prefix reuse after
rename, counter rollback on a failed first creation, and bigint exhaustion.

Create an **empty disposable database** named `gravity_ticket_numbers_test_*` on
an existing PostgreSQL instance, then run from `server/`:

```sh
DATABASE_URL='postgresql://.../gravity_ticket_numbers_test_local' \
  npx tsx scripts/test-ticket-numbers-postgres.ts
```

Drop only that disposable database afterward. The script rejects other database
names and nonempty databases. It does not create, stop, or manage containers, and
must never target shared application data. The test uses the test-only auth
bypass for REST and the real MCP tool executor; no external services are used.
