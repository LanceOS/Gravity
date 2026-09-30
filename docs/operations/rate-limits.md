# Rate limits during Redis outages

Every Redis-backed limiter requires an explicit `failurePolicy`. The policy applies when Redis is absent, disconnected, not ready, rejects EVAL, stops replying, or returns an invalid result. Normal Redis enforcement remains an atomic shared sliding window, with unchanged limits and keys.

| Endpoint / policy | Outage behavior | Reason |
| --- | --- | --- |
| OAuth authorize, token, register | Closed | Protect authorization and credential issuance across replicas |
| OAuth revoke | Local | Keep credential removal available |
| MCP connection issuance (user and IP) | Closed | Protect credential creation |
| MCP connection revocation (user and IP) | Local | Keep credential removal available |
| MCP transport (IP and workspace) | Closed | Prevent unbounded tool execution across replicas |
| Chat streams | Closed | Protect paid generation capacity |
| GitHub reconciliation preview/apply | Closed | Protect external API and mutation capacity |
| Event subscriptions | Local | Preserve real-time availability with bounded admission |

EVAL has a one-second request deadline. Each Redis client can retain at most 128 outstanding limiter commands across all policies. After a timeout, new requests use their outage policy immediately until outstanding timed-out commands settle. Late replies never admit a request twice or clear degraded health; a subsequent successful command proves recovery. Already dispatched commands cannot be canceled and may still consume Redis capacity after the caller falls back, conservatively reducing future capacity.

Closed policies return 503 with `Retry-After: 1`. Local policies retain the configured maximum and window, keyed by the same policy and identity as Redis. Exceeding a local limit returns 429 with a matching `Retry-After` header and JSON delay. Identity resolution failures return 503 rather than bypassing a limiter.

The process-wide fallback store shares capacity between middleware instances with matching namespaces, limits, windows, prefixes, and identities. It stores at most 10,000 hashed keys, each with a constant-size counter. At capacity, new identities receive 503; live budgets are never evicted. A local counter expires one full window after the last accepted fallback request, so it can be stricter than Redis's sliding window. Denied requests do not extend expiration. Expired entries are reclaimed on use, at capacity, and by one unreferenced minute timer.

Fallback budgets survive brief Redis recoveries until expiration, preventing repeated outage/recovery cycles from clearing those budgets. Successful Redis commands immediately resume shared enforcement. Local admissions are not replayed into Redis, and pre-outage Redis history is not copied locally. Local fallback is per process: N replicas can admit up to N local budgets, and process restarts reset them. This availability tradeoff is restricted to revocation and subscriptions; sensitive/costly operations fail closed instead. Deployments intentionally configured with `REDIS_ENABLED=false` continue using the existing in-memory limiter.

The readiness `rateLimiting` check becomes unavailable after an observed Redis limiter failure and recovers once every affected policy successfully executes EVAL. It is optional, so it makes otherwise healthy readiness degraded (200), not unavailable. Redis itself still honors `REDIS_REQUIRED`. No request identities or error details appear in health output or logs. Health transition warnings are limited to once per policy per minute, including during flapping; the health state updates on every observed transition regardless of logging.

Non-Docker regression checks:

```sh
cd server
npx vitest run --config vitest.proxy.config.ts
npm run test:health
npm run typecheck
```
