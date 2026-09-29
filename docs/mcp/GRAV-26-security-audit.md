# GRAV-26: SSE and MCP endpoint security audit

Initial review: 2026-09-29. Ticket remains in progress.

## Confirmed controls

| Surface | Server-side control | Evidence |
| --- | --- | --- |
| SSE handshake | Resolves the authenticated session or verifies a workspace-bound token before accepting a stream. | `server/src/realtime.ts`, `server/tests/events-subscribe.security.test.ts` |
| SSE isolation | Registers and broadcasts streams by workspace; limits connections per user and connection attempts per IP. | `server/src/realtime.ts`, `server/src/routes/index.ts` |
| MCP HTTP | Requires an authenticated actor and fresh workspace membership; explicit bearer credentials take precedence over ambient session cookies. Workspace OAuth requires bearer authentication and validates the resource audience. | `server/src/modules/mcp/router.ts` |
| MCP operations | Checks tool scopes, workspace policy, current membership and role before execution. | `server/src/modules/mcp/policy.ts`, `server/src/modules/mcp/tool-executor.ts` |
| Connection administration | Checks current workspace roles. Members can issue read scopes; privileged roles are required for write scopes. Public issuance validates TTL between 1 and 86,400 seconds. | `server/src/modules/workspaces/routes.ts` |
| Credential lifecycle | Checks workspace, active status, expiry and optional IP binding; token rotation invalidates the old secret. Revocation disconnects token-authenticated SSE streams registered in the same process. | `server/src/modules/mcp/connection.ts` |
| Existing audit events | Logs SSE open/close, MCP token creation/use/refresh/revocation, and authorized tool execution. | `server/src/realtime.ts`, `server/src/modules/mcp/connection.ts`, `server/src/modules/mcp/tool-executor.ts` |

## First remediation

SSE previously used the cached workspace membership helper, whose role cache can
remain valid for 45 seconds. A delayed cache fill or failed invalidation could
therefore let a removed member establish a new stream. Both session and token
SSE handshakes now use the fresh database membership check already used by MCP.

Regression tests simulate a stale Redis membership grant after database removal
and require both authentication methods to receive HTTP 403. Rejected SSE
authentication, membership and concurrency checks now emit structured audit
events without request URLs, cookies or raw credentials.

The PR review identified that rejection audit failures could interrupt HTTP
responses. Both rejection paths now catch audit errors and emit the existing
`security.audit_log_failed` alert without including sink error details. The
401, 403 and 429 responses are preserved even if every alert sink also fails.

## Outstanding audit work

- Established SSE streams currently receive events without rechecking session,
  credential expiry, rotated credentials or workspace membership. The handshake
  fix does not address access changes after a stream has opened.
- SSE revocation uses an in-process connection registry. Verify and implement
  revocation propagation between server replicas before claiming immediate
  cluster-wide disconnection.
- SSE token authentication accepts MCP credentials without a dedicated event
  subscription scope. Define the intended permission boundary before changing
  compatibility with existing clients.
- Complete rejection-event coverage for MCP transport and connection-management
  endpoints and for requests rejected by rate-limit middleware. Success audit
  events alone do not satisfy coverage of every connection attempt.

## Validation

All 29 tests passed across the SSE security, MCP authorization-race,
connection-endpoint, connection-rate-limit and transport-lifecycle suites.
The server TypeScript check and `git diff --check` also passed.
After the review fix, both SSE suites passed all 16 tests, including six
failure-injection cases covering audit-only and total logging outages; the
server TypeScript check passed again.
These integration tests use an isolated in-memory database and
require permission to bind local HTTP test servers. They do not establish
multi-replica revocation behavior or certify the entire authorization surface.
