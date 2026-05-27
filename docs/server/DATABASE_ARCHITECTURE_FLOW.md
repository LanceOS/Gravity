# Database Architecture and Flow

## 1. Purpose and Scope

This document explains the overarching database architecture, connection management, and data flow within the Gravity server. It details how the server connects to the database, manages schema definitions using Drizzle ORM, and routes data interactions from HTTP requests to database queries.

## 2. Non-Goals or Boundary Limits

- This document does not cover the specific domain schemas (e.g., Auth, Workspaces) in deep detail. Refer to the respective data model documents for schema specifics.
- It does not cover database migration deployment strategies or CI/CD pipelines.
- It does not document the GraphQL or WebSocket payload structures unless directly related to database connection pooling.

## 3. Entry Points

- `server/src/db/index.ts`: The primary initialization file for the database connection pool and Drizzle ORM setup.
- `server/src/db/schema.ts`: The central aggregator for all module-specific schemas.

## 4. Flow Steps

1. **Environment Configuration**: The application reads `databaseUrl` from the environment via `server/src/env.ts`.
2. **Connection Pooling Initialization**: `server/src/db/index.ts` creates a connection pool.
    - **In-Memory Fallback**: If the `databaseUrl` begins with `pgmem://`, a `pg-mem` in-memory database instance is instantiated. This includes patching and mocking Postgres functions/operators (`~`, `!~`, `has_schema_privilege`, etc.) for testing or local development without a real Postgres instance.
    - **Standard Postgres Connection**: For standard connection strings, a standard `pg` Pool is established.
3. **Drizzle ORM Hookup**: The pool and the aggregated schemas (`server/src/db/schema.ts`) are passed to `drizzle()`, exporting the `db` singleton.
4. **Route Handlers**: API routes (e.g., `server/src/routes/index.ts`) accept requests and delegate to module-specific controllers, which in turn use the exported `db` singleton to perform CRUD operations.

## 5. Data Stores and Resources

- **Resource**: Postgres Database
  - **Created By**: Infrastructure / Initialization scripts.
  - **Read/Mutated By**: Server-side modules through Drizzle ORM queries using the `db` singleton.
  - **Owned By**: Gravity Server

## 6. Interfaces and Contracts

- **Connection Pool Contract**: Uses `drizzle-orm/node-postgres` with the native `pg` driver.
- **ORM Contract**: Queries and migrations use `drizzle-orm`. All schema exports are centralized in `server/src/db/schema.ts`.

## 7. Key Files and Modules

- `server/src/db/index.ts`: Database instantiation and pooling logic.
- `server/src/db/schema.ts`: Central schema registry.
- `server/drizzle/`: Contains generated Drizzle migrations.

## 8. Permissions, Guards, or Tenant Boundaries

- Tenant boundaries (workspaces, projects) are enforced at the application tier within the controllers or data access layer before executing queries on the `db` instance. The database itself uses a single connection pool.

## 9. Failure Modes, Observability, or Operational Notes

- Connection pooling exhaustion can occur under heavy load if the maximum connections limit of the Postgres pool is reached.
- When running with `pg-mem`, certain native Postgres features may not be perfectly emulated, which can cause subtle testing bugs. The custom patches in `db/index.ts` mitigate the most common issues.

## 10. Change Hazards, Invariants, or Migration Constraints

- Adding new schema files requires registering them in `server/src/db/schema.ts`. Failure to do so means Drizzle won't recognize the tables for migrations or relational queries.
- Changes to the Drizzle configuration must be accompanied by new generated migrations.

## 11. Related Docs

- [Auth Data Model](AUTH_DATA_MODEL.md)
- [User Profile Data Model](USER_PROFILE_DATA_MODEL.md)
- [Workspace Data Model](WORKSPACE_DATA_MODEL.md)
- [Ticket Data Model](TICKET_DATA_MODEL.md)
