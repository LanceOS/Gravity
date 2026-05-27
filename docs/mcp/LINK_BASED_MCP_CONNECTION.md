# Link-Based MCP Connection

## 1. Purpose and Scope
This document defines a secure, link-driven extension for Gravity's existing Model Context Protocol (MCP) support. It describes how a workspace owner or member can generate a workspace-specific connection link, how an external AI client can exchange that link for MCP credentials, and how the server should validate and authorize the resulting connection.

The goal is to support external AI clients beyond Gravity's internal AI provider while preserving the strict workspace, membership, and tool authorization rules already enforced by the MCP subsystem.

## 2. Non-Goals or Boundary Limits
- This document does not describe the internal MCP JSON-RPC operation itself; that is covered by `docs/mcp/MCP_FLOW.md` and server-side transport implementation.
- It does not define full AI provider onboarding, branding, or marketplace integration.
- It does not cover direct token issuance for arbitrary API use outside MCP.
- It is not a complete implementation plan; it is a design and security specification for the link-based connection layer.

## 3. Entry Points
### Existing MCP entry point
- `POST /api/v1/mcp/sse` — existing HTTP MCP transport implemented in `server/src/modules/mcp/router.ts`.

### Link-based connection entry points
The new flow should introduce a dedicated, authenticated endpoint to generate connection payloads for external AI clients.
Suggested API:
- `POST /api/v1/workspaces/:workspaceId/mcp/connection` — returns a generated MCP JSON payload for an authenticated workspace user.
- `POST /api/v1/workspaces/:workspaceId/mcp/connection/refresh` — optionally refreshes a still-valid connection token.

These endpoints are not currently implemented in the repository, but the design assumes they will extend the existing workspace and MCP modules.

The workspace connection link is a trigger for payload generation, not a direct authorization token. The external client must receive the generated payload through a secure, authenticated channel or manual handoff.

## 4. Flow Steps
### Step 1: User generates or copies a workspace connection link
- In the workspace UI, the user chooses a “Connect external AI” action.
- Gravity produces a workspace-scoped link such as:
  - `https://app.example.com/workspaces/<workspaceId>/mcp/connect`
- The link is a convenience for the user and should not itself be treated as a permanent bearer secret.

### Step 2: External client opens the link
- The external client (for example, a VS Code extension or AI application) initiates the flow by opening the workspace connection link in an authenticated browser or secure host environment.
- The request must be made over HTTPS and must be associated with an authenticated user session or delegated, user-approved access.
- The client should not treat the link itself as the final secret; the link is a request to generate the actual connection payload.

### Step 3: Server validates the requester and memberships
- Server verifies authentication via standard session handling using `server/src/modules/auth/utils/request-auth.ts`.
- Server confirms the caller is a workspace member using `server/src/modules/workspaces/services/membership.ts` or equivalent membership logic.
- Server confirms the workspace is configured to allow MCP access and that the user is permitted to generate a connection.
- The server also validates that the request is a deliberate credential issuance action, not an automated unauthenticated discovery call.

### Step 4: Server generates a short-lived MCP payload
- The server produces a JSON payload containing:
  - `type` — the MCP transport or connection style.
  - `args` — the workspace endpoint and transport metadata.
  - `auth` — a short-lived one-time token or signed registration payload.
  - `scopes` — a least-privilege list of allowed MCP operations.
  - `metadata` — non-sensitive display attributes only.
- The link is a trigger to generate this payload; the payload itself is the actual connection credentials.
- The generated payload must be delivered securely to the external client via a trusted channel, such as a one-time copy/paste or an authenticated extension handoff.

### Step 4.1: External client auth model
- The external client may not have a Gravity browser session when it connects to MCP.
- Therefore the generated payload must carry the auth material required to authenticate the MCP request independently of the original browser session.
- This payload is effectively the external client's credential for the MCP connection and must be treated as a short-lived, single-use secret.
- The external client should connect to MCP by presenting both the workspace identifier and the generated credential in the request.

### Step 5: External client uses the payload to connect to MCP
- The external AI client uses the generated payload to connect to `POST /api/v1/mcp/sse`.
- The client supplies the workspace identity and the generated token.
- The existing MCP router validates workspace membership and forwards the request to the MCP handler.

### Step 6: Server validates connection and enforces tenant guard
- `server/src/modules/mcp/router.ts` authenticates the request with `resolveRequestActorUserId`.
- The request must include a valid `workspaceId` via `X-Workspace-Id` or `params.workspaceId`.
- `isWorkspaceMember(workspaceId, actorUserId)` verifies the user is authorized for that workspace.
- The server should also validate the connection token against the new link-based token store.

### Step 7: Runtime authorizations are enforced
- The request enters the existing MCP JSON-RPC handler and executes tools only if allowed.
- Workspace-level tool disablement rules are enforced via `getDisabledTools`.
- Every tool call is still bound to a single `workspaceId` and the effective actor identity.

## 4.2 Sample connector exchange sequence
1. User clicks "Connect external AI" in the workspace UI.
2. Gravity generates a workspace-specific connection link such as `/workspaces/<workspaceId>/mcp/connect`.
3. The external client opens that link in a secure authenticated browser flow.
4. Gravity validates the user session and workspace membership.
5. Gravity returns a generated payload with `auth.scheme`, `token`, `expiresAt`, and allowable `scopes`.
6. The external client receives the payload and stores it transiently.
7. The external client sends `POST /api/v1/mcp/sse` with:
   - `Authorization: Bearer <one_time_connection_token>`
   - `X-Workspace-Id: <workspaceId>`
   - request body containing the MCP JSON-RPC payload and matching `params.workspaceId`
8. The MCP router authenticates the token, verifies workspace membership, and forwards the request to the JSON-RPC handler.
9. The server executes permitted tools and returns MCP JSON-RPC responses.

## 5. Data Stores and Resources
### Existing runtime data
- `workspaceMembers` — membership table used by `server/src/modules/workspaces/services/membership.ts`.
- `workspaceSettings.disabledMcpTools` — workspace tool disablement list used by MCP authorization.

### Recommended new persistence
A secure link-based MCP implementation should add a data store for connection payload metadata and tokens:
- `mcp_connection_tokens` (or similar)
  - `id`
  - `workspaceId`
  - `generatedByUserId`
  - `tokenValueHash`
  - `scopes`
  - `expiresAt`
  - `usedAt` or `status`
  - `createdAt`
  - `sourceIp`
  - `connectionType`

This store must be encrypted or hashed for any secret token values and treated as an audit/log resource.

## 6. Interfaces and Contracts
### Link generation request
Request:
- `POST /api/v1/workspaces/:workspaceId/mcp/connection`
- Requires standard authenticated session/cookie.
- Must validate workspace membership and workspace-level MCP enablement.

Response example:
```json
{
  "type": "mcp_http",
  "args": {
    "mcpEndpoint": "https://app.example.com/api/v1/mcp/sse",
    "workspaceId": "ws_1234",
    "transport": "http-post",
    "protocol": "mcp-jsonrpc"
  },
  "auth": {
    "scheme": "one_time_token",
    "token": "otk_4fH2xxyZ",
    "expiresAt": "2026-05-27T14:00:00Z",
    "singleUse": true
  },
  "scopes": ["tools/list", "tools/call"],
  "metadata": {
    "workspaceName": "Customer Support",
    "generatedBy": "alice@example.com"
  }
}
```

### MCP connection request
The existing `POST /api/v1/mcp/sse` endpoint remains the transport interface. The generated payload must be used to authenticate and bind the connection to the correct workspace independently of the original browser session.

Security requirements for the MCP request include:
- `X-Workspace-Id` or `params.workspaceId` must match the generated payload.
- the one-time token must be valid, unexpired, and not previously consumed.
- the token should be tightly bound to workspace and scope.
- the external client must present the generated token in an authorization header or equivalent request field rather than rely on the browser session.

Recommended MCP request contract example:
- Header: `Authorization: Bearer <one_time_connection_token>`
- Header: `X-Workspace-Id: <workspaceId>`
- Body: `params.workspaceId` may be provided for redundancy and must match the header.

### Recommended token binding
- Use `auth.scheme: one_time_token` for manual connector payloads.
- Avoid issuing long-lived bearer secrets in the generated JSON.
- Do not embed permanent workspace credentials in the link itself.
- Treat the generated payload as sensitive: do not log the raw token value, do not include it in browser history, and do not store it in plaintext.

## 7. Key Files and Modules
The link-based connection design is built on top of existing MCP and workspace code.
- `server/src/modules/mcp/router.ts` — HTTP MCP transport and workspace validation.
- `server/src/modules/auth/utils/request-auth.ts` — request authentication helper.
- `server/src/modules/workspaces/services/membership.ts` — workspace membership guard.
- `server/src/modules/mcp/request-handler.ts` — MCP JSON-RPC request processing.
- `server/src/modules/mcp/index.ts` — MCP module exports and shared helpers.
- `docs/mcp/MCP_FLOW.md` — existing MCP flow documentation.
- `docs/server/SERVER_MODULE_MCP.md` — module-level architecture reference.

## 8. Permissions, Guards, or Tenant Boundaries
### Tenant binding
- Every external MCP connection must remain bound to exactly one `workspaceId`.
- The generated payload and the subsequent MCP request must both assert the same workspace.

### Membership guard
- The link generation endpoint must only be callable by authenticated users with workspace membership.
- `isWorkspaceMember(workspaceId, actorUserId)` is the existing guard used by `server/src/modules/mcp/router.ts`.

### Scope and tool restrictions
- Generated payloads should explicitly list allowed scopes such as `tools/list` and `tools/call`.
- Workspace `disabledMcpTools` settings must still be enforced by the MCP handler.

### External provider verification
- For a strong external AI integration, require one of the following provider identity methods in addition to the short-lived token:
  - signed JWTs using a provider-specific public key or JWKS endpoint,
  - HMAC challenge-response with a provider key, or
  - mutual TLS (mTLS) client certificate authentication.
- These methods prove the external AI client controls the connection endpoint and reduce risk from token leakage alone.

### Least privilege
- Grant only what is required for the external AI connection.
- Do not issue administrative or broad user-level credentials through this flow.
- Store metadata separately from secrets.
- Do not log raw tokens or secret payload values. Use hashed or masked audit entries instead.

## 9. Failure Modes, Observability, or Operational Notes
### Failure modes
- expired or replayed tokens
- workspace mismatch between payload and MCP request
- unauthorized link generation by non-members
- token store corruption or expired token retention
- AI provider attempting to use the link after it has been revoked

### Observability
- log payload generation events with workspace ID and requester user ID.
- log MCP connection attempts and token validation failures.
- capture the source IP and user agent of the connecting external client.
- audit `disabledMcpTools` evaluations when the MCP request is processed.

### Operational guidance
- prefer short TTLs (minutes) for generated connection tokens.
- support explicit revocation and expiration of outstanding tokens.
- hide raw token values from UI after generation; show only masked metadata.
- require HTTPS and enforce strict transport security.

## 10. Change Hazards, Invariants, or Migration Constraints
- The new link endpoint must never bypass the existing MCP workspace membership guard.
- If `workspaceId` becomes optional in MCP transport requests, tenant isolation is broken.
- Changing the token binding semantics after rollout may invalidate existing connectors.
- Adding new `scopes` should be done conservatively and documented alongside workspace tool disablement.

## 11. Security Hardening Checklist
These items are required for a production-grade link-based MCP flow.

- Token lifecycle & delivery
  - Use `POST` for token issuance and never place tokens in URLs or redirects.
  - Return the raw token exactly once over HTTPS. Set `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, and an appropriate `Content-Security-Policy` for the modal.
  - Display the token once in the UI and then show only a masked preview.

- Cryptography & key management
  - Generate tokens with >=256 bits of entropy and use URL-safe encoding.
  - Store only a keyed hash of the token (HMAC-SHA256) and persist the `hmacKeyId` to enable rotation.
  - Manage HMAC keys in a KMS and rotate keys periodically; verify tokens against current and recent keys as needed.

- Atomic consumption & DB semantics
  - Validate-and-consume must be atomic. Use a single UPDATE ... RETURNING or a transaction that ensures `status = 'active'` and `expires_at > now()` before setting `status = 'used'`.
  - Example pseudocode:

    BEGIN TRANSACTION;
    UPDATE mcp_connection_tokens
      SET status = 'used', used_at = now()
      WHERE id = :id AND status = 'active' AND expires_at > now()
      RETURNING id;
    -- If no row returned: rollback and reject; else commit and accept.

- Verification & comparison
  - Use constant-time comparison for token verification (compare hashes).
  - Enforce TTL, `singleUse` semantics, and immediate revocation when misuse is detected.

- CSRF, origin and cookie controls
  - Protect issuance endpoints from CSRF (SameSite cookies, CSRF token, `Origin`/`Referer` checks).
  - Generation must require an authenticated session and explicit user consent in the UI.

- Network controls & CORS
  - Require TLS and HSTS. Restrict CORS for browser endpoints; the MCP transport should be treated as a server-to-server API.

- Rate limiting & monitoring
  - Apply per-user and per-workspace rate limits to issuance and validation endpoints.
  - Alert on suspicious patterns (many failed validations, repeated issuance by the same actor, or rapid revocations).

- Logging & auditing
  - Record `token_created`, `token_used`, `token_revoked`, and `token_validation_failed` events with `workspaceId`, `tokenId`, `generatedByUserId`, `sourceIp`, and `userAgent` — never store raw tokens in logs.
  - Mask token previews in the UI and logs.

- Threat model reminders
  - Clipboard leakage: mitigate via short TTLs, single-use tokens, and user guidance.
  - Replay: mitigate with atomic consumption and DB checks.
  - Brute-force: mitigate with large token entropy, rate limits, and monitoring.
  - Provider impersonation: require signed JWTs, HMAC-challenge, or mTLS for high-trust integrations.

## 12. Related Docs
- [MCP and Agent Interactions](MCP_FLOW.md)
- [Server MCP Module](../server/SERVER_MODULE_MCP.md)
- [Client MCP and WebMCP UX](../client/CLIENT_USER_INTERACTIONS.md)
