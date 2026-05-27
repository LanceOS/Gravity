# Server Redis & Cache Subsystem

## 1. Purpose and Scope
The `cache` subsystem provides a high-performance, resilient caching layer for the Gravity backend server using Redis. It is designed to reduce database load and improve response times for high-frequency read operations. The subsystem abstracts Redis interactions, offering a typed, secure, and fault-tolerant API for caching application data.

## 2. Non-Goals or Boundary Limits
- **Not a Primary Data Store**: Redis is treated strictly as an ephemeral cache. All cached data must have a primary source of truth in PostgreSQL.
- **Soft Dependency**: The server must continue to function even if Redis is completely unavailable, misconfigured, or unreachable. 
- **No Long-Term Storage**: Data should always be cached with a Time-To-Live (TTL). Redis is not used for persistent state management.

## 3. Entry Points
The subsystem exposes a clean interface via `server/src/lib/cache.ts`:
- **Cache-Aside Wrapper**: `wrap<T>(key, ttlSeconds, fetchFn)` - The recommended entry point for data fetching.
- **Direct Operations**: `get<T>(key)`, `set<T>(key, value, ttlSeconds)`, `del(key)`.

## 4. Flow Steps
1. **Application Boot**: `server/src/lib/redis.ts` initializes the Redis singleton if `REDIS_ENABLED=true`. It begins connecting asynchronously in the background so it doesn't block server startup.
2. **Data Fetching (`wrap`)**: 
   - The application calls `wrap` for a resource (e.g., a workspace summary).
   - If Redis is available, it attempts to `get` the parsed JSON value.
   - On a cache hit, the data is returned immediately.
   - On a cache miss (or if Redis is down), the fallback `fetchFn` is executed against the primary database.
   - The result is asynchronously cached via `set` and returned to the caller.
3. **Cache Invalidation**: Mutations to resources must explicitly call `del(key)` or pattern-matching deletions to clear stale data from the cache to ensure consistency.

## 5. Data Stores and Resources
- **Redis Server**: The underlying memory store, configured via environment variables:
  - `REDIS_ENABLED`: Toggle to enable/disable caching subsystem entirely.
  - `REDIS_URL`: Connection string (supports `rediss://` for TLS).

## 6. Interfaces and Contracts
The `cache.ts` module exports generic, type-safe functions. It automatically handles:
- JSON Serialization/Deserialization.
- Graceful error catching on connection drops.
- Removing malformed data gracefully (e.g. if an entry fails to parse as JSON).

## 7. Key Files and Modules
- `server/src/lib/redis.ts`: Manages the Redis client singleton lifecycle, connection events, reconnect strategies, and graceful shutdown.
- `server/src/lib/cache.ts`: The caching service API that implements the "soft-dependency" logic and cache-aside patterns.
- `server/tests/cache.test.ts`: Comprehensive unit testing suite verifying cache hits, misses, error resilience, and shutdown behavior.

## 8. Permissions, Guards, or Tenant Boundaries
- **Strict Namespacing**: All cache keys are prefixed with `gravity:` (enforced via `getFullKey()`). This helps avoid collisions with other applications; run separate Redis instances/DBs (or add an environment-specific prefix) to isolate multiple Gravity environments.
- **Tenant Isolation**: When caching tenant-specific data, cache keys MUST include the Tenant ID / Workspace ID (e.g., `workspace_summary_cache_key_${workspaceId}`). Cross-tenant data leakage via cache is prevented by incorporating boundary identifiers directly into the cache key.

## 9. Best Security Practices and Implementation Standards
- **Thundering Herd Prevention**: The connection retry logic uses a custom exponential backoff strategy with jitter (capped at 5s) to avoid slamming the Redis server with synchronized reconnection attempts.
- **Exception Containment**: Node.js will crash if an `error` event is emitted on an EventEmitter without a listener. `redis.ts` binds an `error` listener globally to prevent the entire backend process from crashing due to transient network failures.
- **Graceful Shutdown**: Listens to `SIGINT` and `SIGTERM` signals to cleanly invoke `client.quit()`, ensuring pending cache writes complete and connections are safely closed before the Node process exits.
- **Data Validation**: `get` wraps `JSON.parse` in a `try/catch` block. If cache poisoning or malformed data occurs, it asynchronously cleans up the bad key and falls back to the database as a cache miss, ensuring application stability.
- **Secure Transport layer**: By supplying a `rediss://` protocol URL, the Redis client seamlessly uses TLS. This is critical for environments where cache traffic traverses untrusted network zones.

## 10. Proper Use Cases
- **High-Read / Low-Write**: Best suited for heavily requested resources that rarely change, like Workspace summaries, feature flags, or public profiles.
- **Aggregated / Computed Data**: Ideal for caching expensive SQL queries (e.g., analytics or dashboard statistics) that take significant time to compute.
- **DO NOT USE FOR**: Highly transactional state (e.g., user balances, ticket state changes requiring instant consistency) or sensitive data without explicit encryption in transit and at rest.

## 11. Change Hazards, Invariants, or Migration Constraints
- **Test Invariants**: The `client` object inside `redis.ts` is mutable and exported alongside a `setClient(mock)` helper. This is a strict invariant to support the Vitest mocking framework. Refactoring this module must preserve the ability to inject mocks.
- **Serialization limits**: Objects with circular references or non-serializable fields (like `Date` objects or Maps) will lose type fidelity or crash during `JSON.stringify`. Ensure all cached data consists of plain JSON primitives.

## 12. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
