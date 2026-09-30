**CSRF: Usage and Implementation**

## Purpose and Scope

* **Purpose:** Explain how Cross‑Site Request Forgery (CSRF) protections are implemented and enforced in this repository, why they exist, how to configure them, and operational guidance for maintainers and deployers.
* **Scope:** Server‑side CSRF protections for HTTP API endpoints served by the Node/Express server in this repository. This document describes the middleware, configuration, runtime behavior, bypass rules, test behavior, and operational controls. It does NOT attempt to teach general CSRF theory beyond the minimum context needed to operate the code.

## Non-Goals or Boundary Limits

* This doc does not replace an in‑depth web security course. It focuses on how CSRF is applied in this codebase and recommended deployment practices.
* It does not cover client‑side CSRF token usage patterns in frontend apps (beyond basic notes and examples).

## Entry Points

* Global API router: the CSRF middleware is mounted at the top of the API router factory in [server/src/routes/index.ts](server/src/routes/index.ts#L1). See the invocation of `csrfProtect()` in `createApiRouter`.
* Workspace router: the workspace router also mounts CSRF (defensive double‑apply) in [server/src/modules/workspaces/routes.ts](server/src/modules/workspaces/routes.ts#L753). This router contains MCP connection endpoints used to issue, refresh, and revoke credentials. The raw token is returned on issue or refresh and is not retrievable afterward.

## Flow Steps (detailed)

The core CSRF enforcement is implemented as an Express middleware exposed from `server/src/lib/csrf.ts` with the function signature:

```
csrfProtect(allowedOrigins?: string[], options?: { enforceInTest?: boolean; allowedServiceTokens?: string[]; allowHostFallback?: boolean; trustedProxies?: string[] })
```

Runtime flow when a request hits the middleware:


1. If the HTTP method is safe (`GET`, `HEAD`, `OPTIONS`) the middleware allows the request through.
2. If running under `NODE_ENV === 'test'` the middleware is NO‑OP unless `options.enforceInTest === true` (this is used by unit tests to assert behavior).
3. The middleware checks for service‑level headers: `x-service-token` or `x-api-key`. If one is present and matches a configured allowlist (`TRUSTED_SERVICE_TOKENS`), the request is allowed.
4. Otherwise, the middleware validates the request origin:
   * Prefer the `Origin` header.
   * If `Origin` is not present, attempt to derive the origin from the `Referer` header.
   * Normalize the origin by trimming trailing slashes and lower‑casing for comparison.
   * Compare the normalized origin against the configured `TRUSTED_ORIGINS` list.
   * If `Origin` matches any trusted origin, the request is allowed.
5. Only when both Origin and Referer are absent, optional host fallback may allow the request: `allowHostFallback` must be enabled, the immediate socket peer must match `TRUSTED_PROXIES`, and a single `X-Forwarded-Host` must match a host derived from the allowed HTTP(S) origins. An explicit disallowed origin can never use this fallback. See the [proxy deployment requirements](#proxy-deployment-note).
6. If none of the checks succeed, the middleware returns `403` with a JSON error body such as `{ error: 'Missing Origin or Referer header.' }` or `{ error: 'Invalid Origin or Referer header.' }`.

`Authorization` is not a generic middleware bypass. The API router exempts only the bearer-authenticated MCP transports described below; each transport then validates its credential. A random or malformed `Authorization` value on an ordinary cookie-authenticated API route does not replace its Origin/Referer check.

## Implementation details and invariants

* File: [server/src/lib/csrf.ts](server/src/lib/csrf.ts#L1)
  * Normalizes origins with a simple `origin.replace(/\/$/, '').toLowerCase()` normalization.
  * Uses `env.trustedOrigins` (parsed from environment `TRUSTED_ORIGINS` or defaulted to `http://localhost:${PORT}`) when no explicit `allowedOrigins` param is passed.
  * Accepts a second `options` parameter for test enforcement, runtime service token allowlist, optional host fallback, and trusted proxy IPs/CIDRs.
  * Bypass rules in order: safe methods → test env (unless enforced) → allowlisted `x-service-token`/`x-api-key` → `Origin`/`Referer` → optional missing-header `X-Forwarded-Host` fallback → deny.
  * Bearer exemptions are scoped in [server/src/routes/index.ts](server/src/routes/index.ts#L1): POST `/mcp` and `/mcp/sse` skip generic CSRF only when a complete Bearer credential selects the token-authenticated path; POST `/workspaces/:workspaceId/mcp` is OAuth bearer-only and must be reachable for its initial challenge.

## Data Stores and Resources

* No persistent DB state is required for CSRF checks themselves. Configuration and allowlists come from environment variables and in‑process config.
* Environment variables of interest (parsed in [server/src/env.ts](server/src/env.ts#L1)):
  * `TRUSTED_ORIGINS` — comma separated list of trusted origins (used to populate `env.trustedOrigins`). If not provided, the server defaults to `http://localhost:<PORT>`.
  * `TRUSTED_SERVICE_TOKENS` — comma separated list of service tokens that may bypass CSRF via `x-service-token` or `x-api-key` headers.
  * `CSRF_ALLOW_HOST_FALLBACK` — disabled by default; enables the restricted missing-header exception described below.
  * `TRUSTED_PROXIES` — exact ingress IPs or IPv4/IPv6 CIDRs; empty trusts no proxies and invalid entries fail startup.
  * `NODE_ENV` — `test` disables checks by default to keep unit tests deterministic unless `enforceInTest` is used.

## Interfaces and Contracts

* Middleware signature: `csrfProtect(allowedOrigins?: string[], options?: { enforceInTest?: boolean; allowedServiceTokens?: string[]; allowHostFallback?: boolean; trustedProxies?: string[] })` (see [server/src/lib/csrf.ts](server/src/lib/csrf.ts#L1)).
* Request headers used by the middleware:
  * `Origin` — preferred source for the caller origin.
  * `Referer` / `Referrer` — fallback when `Origin` is missing; the middleware derives `new URL(referer).origin`.
  * `Authorization` — does not bypass generic CSRF checks. The API router recognizes a complete Bearer credential only on MCP transport paths whose handlers validate bearer authentication.
  * `X-Service-Token` / `X-API-Key` — used for trusted service token bypass when tokens are configured.
  * `X-Forwarded-Host` — used only for the explicitly enabled missing-header fallback from a trusted socket peer. The client `Host` header is never an origin-policy substitute.
* Failure responses:
  * 403 `{ error: 'Missing Origin or Referer header.' }` — when no usable origin can be derived and the restricted fallback does not apply (including missing or empty headers and malformed Referers).
  * 403 `{ error: 'Invalid Origin or Referer header.' }` — origin present but not allowed.
  * 500 `{ error: 'CSRF check failed.' }` — middleware internal error.

## Key Files and Modules (what to read)

* CSRF middleware implementation: [server/src/lib/csrf.ts](server/src/lib/csrf.ts#L1)
* Environment configuration and defaults: [server/src/env.ts](server/src/env.ts#L1)
* Global API router (middleware mount): [server/src/routes/index.ts](server/src/routes/index.ts#L1)
* Workspace router (contains MCP issuance endpoints): [server/src/modules/workspaces/routes.ts](server/src/modules/workspaces/routes.ts#L1)
* Unit tests for CSRF behavior: [server/tests/csrf.middleware.test.ts](server/tests/csrf.middleware.test.ts#L1)
* MCP token and endpoint behavior: [server/src/modules/mcp/connection.ts](server/src/modules/mcp/connection.ts#L1) and [server/src/modules/workspaces/routes.ts](server/src/modules/workspaces/routes.ts#L1)

## Permissions, Guards, and Tenant Boundaries

* CSRF is a transport‑level/HTTP boundary control and does not replace application authorization checks. All sensitive endpoints should continue to perform explicit authorization checks (e.g., membership, workspace ownership) in route handlers — see membership checks in [server/src/modules/workspaces/routes.ts](server/src/modules/workspaces/routes.ts#L1).
* CSRF is applied globally for API routes. An arbitrary `Authorization` header cannot bypass checks on session-authenticated routes. The MCP bearer transports have route-specific exemptions because their handlers authenticate the bearer credential; configured service tokens remain an explicit generic exemption and must be tightly scoped and rotated regularly.

## Failure Modes, Observability, and Operational Notes

* Common failure modes:
  * **Legitimate requests blocked**: often due to missing `Origin`/`Referer` because a proxy or client strips the header. Preserve these headers; optional forwarded-host fallback requires the trusted-ingress controls below.
  * **Tests bypassing CSRF**: unit tests run with `NODE_ENV === 'test'` and middleware is no‑op by default; use `options.enforceInTest` in tests when asserting middleware behavior.
  * **Service token misuse**: service tokens in `TRUSTED_SERVICE_TOKENS` are bearer‑style secrets. If leaked, an attacker could bypass CSRF protections; store and rotate them securely.
* Observability recommendations:
  * Log blocked origins and deny responses with a structured log message including `req.path`, `req.method`, and the normalized origin/referer when a 403 is returned.
  * Log bypass events for the route-specific MCP bearer transports and configured service-token use at `info` level so audits can correlate bypasses to automation runs.

## Change Hazards, Invariants, and Migration Constraints

* Changing `TRUSTED_ORIGINS`:
  * Adding or removing origins can immediately allow or block legitimate browser clients. Roll out changes with a short monitoring window and consider adding new origins before removing old ones.
* Service token rotation:
  * `TRUSTED_SERVICE_TOKENS` is parsed from environment variables at process start. Rotating service tokens requires updating the environment and restarting server processes.
* Test behavior:
  * Tests run in `NODE_ENV === 'test'` where CSRF is disabled by default to make many codepaths easier to exercise. Tests that need to assert middleware behavior must pass `enforceInTest: true` in the test harness (see [server/tests/csrf.middleware.test.ts](server/tests/csrf.middleware.test.ts#L1)).

## Related Docs

* MCP and connection token flow: [docs/mcp/MCP_FLOW.md](docs/mcp/MCP_FLOW.md)
* Server auth & session model: [docs/server/SERVER_MODULE_AUTH.md](docs/server/SERVER_MODULE_AUTH.md)

## Operational checklist (quick start)


1. Set `TRUSTED_ORIGINS` in your environment to the list of allowed browser origins (comma separated):

```
TRUSTED_ORIGINS=https://app.example.com,https://admin.example.com
```


2. If you have automation that must bypass CSRF, set `TRUSTED_SERVICE_TOKENS` (comma separated):

```
TRUSTED_SERVICE_TOKENS=svc-token-abc123,svc-token-xyz456
```


3. Ensure session cookies include `SameSite=Lax|Strict`, `HttpOnly`, and `Secure` when applicable.
4. Ensure proxies and CDNs preserve `Origin`/`Referer`. If the missing-header exception is unavoidable, follow the [proxy deployment requirements](#proxy-deployment-note); forwarding headers alone do not validate a browser source origin.

## Evidence used while writing this document

* `server/src/lib/csrf.ts` — middleware implementation and bypass rules.
* `server/src/env.ts` — environment variables and defaults: `TRUSTED_ORIGINS`, `TRUSTED_SERVICE_TOKENS`, and how `trustedOrigins` is calculated.
* `server/src/routes/index.ts` — global middleware mount.
* `server/src/modules/workspaces/routes.ts` — workspace router and MCP endpoints.
* `server/tests/csrf.middleware.test.ts` — unit tests that demonstrate expected behavior and bypass rules.

## Open questions & recommended follow-ups

* Consider removing duplicate middleware mounts (global + per‑router) to avoid confusion; keep the middleware mounted once per request pipeline.
* Add structured audit logging inside `csrfProtect` to capture bypass and denial events with correlation IDs.
* Consider adding an allowlist service that stores service tokens in a secrets manager (KMS/HashiCorp Vault) instead of environment variables for easier rotation.

## Document history

* 2026-05-27: Initial document created to describe CSRF usage and implementation in this repository.

## MCP compatibility note (short)

- MCP HTTP transport (`/api/v1/mcp/sse`) uses bearer tokens. External connectors should call the
  transport with `Authorization: Bearer <connection-token>` and include `X-Workspace-Id: <workspace-id>`.

- The API router skips generic CSRF for POST `/api/v1/mcp` and `/api/v1/mcp/sse` only when a complete
  `Authorization: Bearer ...` credential selects the MCP token path. That handler validates the token,
  uses it in preference to any session cookie, and rejects a supplied untrusted Origin. Cookie-only
  requests to those paths still require the normal CSRF checks. The workspace OAuth endpoint
  `/api/v1/workspaces/:workspaceId/mcp` is also exempt so unauthenticated clients can receive its
  OAuth challenge; authenticated requests require an OAuth bearer token and never use a browser cookie.
- In production, manual connection creation, refresh, and revoke endpoints resolve the actor from a
  Better Auth session and apply workspace permission checks. Development can opt into the separate
  `ALLOW_DEV_AUTH_BYPASS` shortcut; production requests still require Origin/Referer even
  if an unrelated `Authorization` header is present. Generated credentials are returned only on
  creation or refresh, the server stores an HMAC verification hash, and those responses set
  `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- Browser sign-in uses Better Auth HttpOnly, SameSite=Lax cookies; session credentials are not kept in
  localStorage. A manually generated MCP credential is different: the dialog intentionally holds and
  displays it in page memory until the dialog closes so the user can copy or download it. An XSS flaw
  could read a credential while it is displayed, so store it in the external client's secure credential
  store and revoke or rotate it if exposed. See [auth architecture](auth/architecture.md) and
  [MCP credential lifecycle](mcp/TRANSPORTS.md#issue-and-manage-credentials).

- Automated credential management must establish a valid Better Auth session and workspace
  permissions. A configured service token satisfies only the generic CSRF middleware exception; it
  supplies no user identity or workspace permission. Do not rely on an arbitrary Authorization header
  to exempt unrelated API routes from CSRF checks.

- If you encounter 403s for issuance from automation, check proxies/CDNs for header stripping and
  confirm the client has a valid session and sends a trusted Origin or Referer. Use a configured service
  token only when the deployment intentionally needs that additional CSRF exception.

## Proxy deployment note

Host fallback is disabled by default. For requests subject to origin checks (after
the safe-method, test, and allowlisted service-token bypasses above), an explicit Origin (or Referer when Origin
is absent) must match `TRUSTED_ORIGINS` / the middleware's `allowedOrigins`,
including scheme and port. Matching `Host` or `X-Forwarded-Host` never overrides
a disallowed origin. Malformed Referers do not qualify for missing-header fallback.

For a legacy ingress that strips both Origin and Referer, explicitly opt in:

1. Set `CSRF_ALLOW_HOST_FALLBACK=true` in the backend process environment.
2. Configure `TRUSTED_PROXIES` with only the immediate ingress IPs or dedicated
   proxy-only IPv4/IPv6 CIDRs. This uses the same validated matcher as client-IP
   resolution, including IPv4-mapped IPv6 normalization; invalid entries fail
   middleware construction/startup. An empty list trusts no peers.
3. Configure permitted public origins in `TRUSTED_ORIGINS`. The forwarded host
   must exactly match a host (including a non-default port) derived from one of
   these HTTP(S) origins. No client `Host` fallback is accepted.
4. Have the trusted ingress overwrite incoming `X-Forwarded-Host` with one
   validated public host, rejecting unexpected host routing. Comma-separated
   forwarded-host lists are rejected. Preserve a required non-default port.

Only requests missing both Origin and Referer can use this exception. Trust is
based exclusively on the immediate TCP socket peer, never Express `req.ip`,
`X-Forwarded-For`, or another client-supplied address. Restrict backend access and
control every forwarding hop; do not trust broad networks containing clients.

**This exception weakens CSRF protection:** the destination host alone does not
prove the browser's source origin. Prefer preserving Origin/Referer and leaving
the fallback disabled. Ingress that strips those headers must provide equivalent
source-origin/CSRF validation before forwarding. The supplied nginx overwrite of
`X-Forwarded-Host` alone does not provide that validation. See
[trusted proxy deployment requirements](trusted-proxies.md).
