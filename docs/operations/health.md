# Deployment health

`GET /api/v1/health/live` is a lightweight process liveness check (200 while the HTTP server is running). It does not contact dependencies. Use it for liveness, not deployment readiness.

`GET /api/v1/health/ready` and the compatibility alias `/api/v1/health` return a bounded dependency snapshot:

- `ok` (200): every dependency probe succeeded.
- `degraded` (200): an optional dependency is unavailable; inspect `checks`.
- `unavailable` (503): initialization/shutdown or a required dependency prevents readiness.

Probes run concurrently with a two-second deadline. PostgreSQL has separate connection/query/server timeouts and a two-connection probe pool. Outstanding probes are shared so timeouts cannot create an unbounded queue. Responses expose only dependency names, required flags, and status, without URLs, credentials, or error messages. Responses are not cacheable.

PostgreSQL and the bootstrap schema version are always required. Object storage checks authenticated access to the configured bucket and is required by default (`OBJECT_STORAGE_REQUIRED=true`). Startup provisions a missing bucket using the existing application's bucket-creation policy. Provision the bucket externally if the runtime identity lacks create permission. An unavailable store at initial provisioning may require a restart after recovery if the bucket does not yet exist.

Redis is optional by default (`REDIS_REQUIRED=false`), including when disabled: readiness reports degraded because distributed rate limiting/events are unavailable. Set `REDIS_REQUIRED=true` and `REDIS_ENABLED=true` if those capabilities are mandatory. Redis readiness requires both a ready connection and a successful PING. PING does not detect Lua/EVAL permission or command-specific rate-limiter failures. GRAV-229 tracks fallback policies and a future command-specific degradation signal; the current limiter has no reliable exported signal.

Application routes reject requests with 503 during local initialization, failed migration, or shutdown. Liveness stays available during initialization; readiness fails. Dependency readiness is enforced by deployment health checks; it is not an automatic circuit breaker for every application request. Route traffic only to ready instances in an orchestrator. Docker Compose marks an already-running backend unhealthy but does not itself withdraw traffic or restart unhealthy containers.

Bootstrap records `ready=false` before migrations and publishes `REQUIRED_SCHEMA_VERSION` only after success. Bump `server/src/db/schema-version.ts` whenever the bootstrapped schema contract changes. This marker tracks bootstrap, not the separate Drizzle SQL journal. Run one schema initializer at a time; concurrent migrations/rolling schema changes require external serialization.

Production Compose files and the backend image use readiness health checks. Frontend startup waits for a healthy backend. `test-deploy.sh` and `scripts/restart-compose.sh` use Compose `--wait --wait-timeout 180`; startup fails if health does not converge. This requires a Compose implementation supporting `--wait` (including the selected Podman Compose provider). Startup is detached because Compose wait implies detached mode; use Compose logs separately. Local CI also waits for readiness and accepts optional degradation.

Run isolated tests without any services:

```sh
npm --workspace=server run test:health
npm --workspace=server run typecheck
```
