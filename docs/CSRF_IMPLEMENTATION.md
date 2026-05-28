**CSRF: Usage and Implementation**

## Purpose and Scope

* **Purpose:** Explain how Cross‑Site Request Forgery (CSRF) protections are implemented and enforced in this repository, why they exist, how to configure them, and operational guidance for maintainers and deployers.
* **Scope:** Server‑side CSRF protections for HTTP API endpoints served by the Node/Express server in this repository. This document describes the middleware, configuration, runtime behavior, bypass rules, test behavior, and operational controls. It does NOT attempt to teach general CSRF theory beyond the minimum context needed to operate the code.

## Non-Goals or Boundary Limits

* This doc does not replace an in‑depth web security course. It focuses on how CSRF is applied in this codebase and recommended deployment practices.
* It does not cover client‑side CSRF token usage patterns in frontend apps (beyond basic notes and examples).

## Entry Points

* Global API router: the CSRF middleware is mounted at the top of the API router factory in [server/src/routes/index.ts](server/src/routes/index.ts#L1). See the invocation of `csrfProtect()` in `createApiRouter`.
* Workspace router: the workspace router also mounts CSRF (defensive double‑apply) in [server/src/modules/workspaces/routes.ts](server/src/modules/workspaces/routes.ts#L214). This router contains the MCP endpoints used to issue, refresh, and revoke one‑time tokens.

## Flow Steps (detailed)

The core CSRF enforcement is implemented as an Express middleware exposed from `server/src/lib/csrf.ts` with the function signature:

```
csrfProtect(allowedOrigins?: string[], options?: { enforceInTest?: boolean; allowedServiceTokens?: string[] })
```

Runtime flow when a request hits the middleware:


1. If the HTTP method is safe (`GET`, `HEAD`, `OPTIONS`) the middleware allows the request through.
2. If running under `NODE_ENV === 'test'` the middleware is NO‑OP unless `options.enforceInTest === true` (this is used by unit tests to assert behavior).
3. If an `Authorization` header is present (Bearer token), the middleware allows the request through — this is an explicit decision that requests authenticated via explicit bearer credentials are considered non‑browser API calls.
4. The middleware checks for service‑level headers: `x-service-token` or `x-api-key`. If one is present and matches a configured allowlist (`TRUSTED_SERVICE_TOKENS`), the request is allowed.
5. Otherwise, the middleware validates the request origin:
   * Prefer the `Origin` header.
   * If `Origin` is not present, attempt to derive the origin from the `Referer` header.
   * Normalize the origin by trimming trailing slashes and lower‑casing for comparison.
   * Compare the normalized origin against the configured `TRUSTED_ORIGINS` list.
   * If `Origin` matches any trusted origin, the request is allowed.
6. If the origin does not match and the `Host` header matches the origin host component, allow the request (fallback for certain proxy setups).
7. If none of the checks succeed, the middleware returns `403` with a JSON error body such as `{ error: 'Missing Origin or Referer header.' }` or `{ error: 'Invalid Origin or Referer header.' }`.

## Implementation details and invariants

* File: [server/src/lib/csrf.ts](server/src/lib/csrf.ts#L1)
  * Normalizes origins with a simple `origin.replace(/\/$/, '').toLowerCase()` normalization.
  * Uses `env.trustedOrigins` (parsed from environment `TRUSTED_ORIGINS` or defaulted to `http://localhost:${PORT}`) when no explicit `allowedOrigins` param is passed.
  * Accepts a second `options` parameter for test enforcement and runtime service token allowlist.
  * Bypass rules in order: safe methods → test env (unless enforced) → `Authorization` header → `x-service-token`/`x-api-key` → `Origin`/`Referer` → `Host` fallback → deny.

## Data Stores and Resources

* No persistent DB state is required for CSRF checks themselves. Configuration and allowlists come from environment variables and in‑process config.
* Environment variables of interest (parsed in [server/src/env.ts](server/src/env.ts#L1)):
  * `TRUSTED_ORIGINS` — comma separated list of trusted origins (used to populate `env.trustedOrigins`). If not provided, the server defaults to `http://localhost:<PORT>`.
  * `TRUSTED_SERVICE_TOKENS` — comma separated list of service tokens that may bypass CSRF via `x-service-token` or `x-api-key` headers.
  * `NODE_ENV` — `test` disables checks by default to keep unit tests deterministic unless `enforceInTest` is used.

## Interfaces and Contracts

* Middleware signature: `csrfProtect(allowedOrigins?: string[], options?: { enforceInTest?: boolean; allowedServiceTokens?: string[] })` (see [server/src/lib/csrf.ts](server/src/lib/csrf.ts#L1)).
* Request headers used by the middleware:
  * `Origin` — preferred source for the caller origin.
  * `Referer` / `Referrer` — fallback when `Origin` is missing; the middleware derives `new URL(referer).origin`.
  * `Authorization` — presence bypasses CSRF checks (intended for bearer tokens used by non‑browser clients).
  * `X-Service-Token` / `X-API-Key` — used for trusted service token bypass when tokens are configured.
  * `Host` — used as a fallback to allow requests from same host (when proxies or networks strip `Origin`).
* Failure responses:
  * 403 `{ error: 'Missing Origin or Referer header.' }` — when an unsafe request lacks both `Origin` and `Referer`.
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
* CSRF is applied globally for all API routers; service tokens and bearer tokens are **explicitly** allowed to bypass CSRF because they represent non‑browser clients or trusted automation. Keep service tokens tightly scoped and rotate them regularly.

## Failure Modes, Observability, and Operational Notes

* Common failure modes:
  * **Legitimate requests blocked**: often due to missing `Origin`/`Referer` because a proxy or client strips the header. The middleware tries a `Host` fallback but this is not always sufficient.
  * **Tests bypassing CSRF**: unit tests run with `NODE_ENV === 'test'` and middleware is no‑op by default; use `options.enforceInTest` in tests when asserting middleware behavior.
  * **Service token misuse**: service tokens in `TRUSTED_SERVICE_TOKENS` are bearer‑style secrets. If leaked, an attacker could bypass CSRF protections; store and rotate them securely.
* Observability recommendations:
  * Log blocked origins and deny responses with a structured log message including `req.path`, `req.method`, and the normalized origin/referer when a 403 is returned.
  * Log bypass events (Authorization header present or `x-service-token` used) at `info` level so audits can correlate bypasses to automation runs.

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
4. If using proxies or CDNs that modify headers, ensure `Origin`/`Referer` are preserved, or configure the service to populate `Forwarded`/`X-Forwarded-*` headers in a way your deployment supports and update middleware if necessary.

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
  transport with `Authorization: Bearer <one-time-token>` and include `X-Workspace-Id: <workspace-id>`.

- The CSRF middleware explicitly bypasses requests with an `Authorization` header, so MCP JSON-RPC
  calls authenticated this way will not be blocked by CSRF. Token issuance/refresh/revoke endpoints
  remain protected by CSRF because they are intended to be invoked from browser UI flows (session cookies
  and `Origin` checks). For automation that needs to call issuance endpoints, prefer service tokens
  (`X-Service-Token`/`X-API-KEY` from `TRUSTED_SERVICE_TOKENS`) or an authenticated API client.

- If you encounter 403s for issuance from automation, check proxies/CDNs for header stripping and
  prefer service tokens in those environments.


