# Workspace MCP UI Entry Point — Decision & Implementation Guide

## 1. Purpose and Scope
This document records the product and engineering decision to expose the MCP "Connect external AI" flow from the workspace UI. It explains why the workspace page is the safest and most user-friendly anchor, details the RBAC and authentication implications, and provides a prescriptive implementation and rollout checklist that follows best authentication and RBAC practices.

Scope:
- UI placement and UX for generating MCP connection payloads
- Permission checks and server-side guards required
- API contract and token lifecycle expectations
- Developer implementation guidance (client + server)

Non-goals:
- Full MCP transport or JSON-RPC protocol details (see `docs/mcp/MCP_FLOW.md`)
- Provider onboarding flows (e.g., partner mTLS or OAuth2 integration beyond guidance)

## 2. Executive Summary / Decision
Place the "Connect external AI" action in the workspace header (workspace-scoped UI), accessible from the workspace page (`WorkspacePage`). The action opens a modal that lets authorized workspace members generate a short-lived, single-use MCP connection payload. This keeps the feature within the workspace tenancy surface, respects membership boundaries, and offers the best combination of discoverability and security.

Why not other locations:
- Account Settings: global (not workspace-scoped) and would confuse scope; not guaranteed to express workspace context.
- Workspace Settings (owner-only): too restrictive — not all members should be prevented from generating connections if policy allows.
- Project Settings: too narrow for a workspace-level capability.

## 3. Options Considered (short)
- Account-level settings page
  - Pros: central place for integrations
  - Cons: not workspace-bound; risk of accidental cross-workspace issuance
- Workspace Settings / Admin area
  - Pros: natural for admin-level control
  - Cons: owner/admin-only; prevents non-owner members from using valid workflows
- Project Settings
  - Pros: scoped to project
  - Cons: MCP operates at workspace scope; mismatch
- Workspace Page Header (recommended)
  - Pros: workspace context present, discoverable, easily gated by membership/role checks
  - Cons: needs careful RBAC to avoid over-permissive issuance

## 4. Recommendation (detailed)
Add a workspace-level action in the `WorkspaceHeader` area (client path: `client/src/modules/workspaces/components/WorkspaceHeader.tsx`). The action should open a modal component (suggested new file: `client/src/modules/workspaces/components/WorkspaceMcpModal.tsx`) that:
- Describes what the connection grants (scopes, expiry)
- Requires explicit confirmation before issuance
- Shows a one-time copyable payload (masked afterwards)
- Links to workspace-level controls (owner can revoke all external connectors)

Show/hide behavior:
- Visible to users who are `isWorkspaceMember(workspaceId, userId)` (server check: `server/src/modules/workspaces/services/membership.ts`).
- Optionally restrict to roles (owner/admin) if workspace policy requires. Always enforce server-side authorization regardless of UI visibility.

## 5. UX Flow (user-focused)
1. User navigates to the workspace page (`WorkspacePage`) for `workspaceId`.
2. User clicks `Connect external AI` in the workspace header.
3. A modal opens showing:
   - What MCP access does: `tools/list`, `tools/call`, etc.
   - Default TTL (e.g., 5 minutes) and single-use notice
   - Generated-by user and workspace name
   - A checkbox for explicit consent: "I understand this will grant an AI access to this workspace's MCP tools."
4. User confirms; the client calls `POST /api/v1/workspaces/:workspaceId/mcp/connection`.
5. Server validates membership and policy, creates a hashed token and an audit row, and returns the generated payload.
6. Modal displays the payload (raw token allowed only once) and provides a `Copy` button and `Done`/`Revoke` actions.
7. External client uses the payload to connect to `POST /api/v1/mcp/sse` with `Authorization: Bearer <one_time_connection_token>` and `X-Workspace-Id: <workspaceId>`.
8. Server validates and binds the connection to the specified `workspaceId` and the effective `actorUserId` (or the token-specific registration identity).

Notes:
- The UI must make clear this is a one-time token and copying to clipboard is risky; provide guidance and prefer extension-based secure handoff where possible.

## 6. API & Server Contract (prescriptive)
### `POST /api/v1/workspaces/:workspaceId/mcp/connection`
- Auth: requires authenticated session (cookie/session) and membership check.
- Body (optional): `{ "scopes": ["tools/list","tools/call"], "connectionType": "http-post" }`
- Response (201):
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
  "scopes": ["tools/list","tools/call"],
  "metadata": { "workspaceName": "Acme", "generatedBy": "alice@example.com" }
}
```
- Server actions:
  - validate session and `isWorkspaceMember(workspaceId, actorUserId)`
  - validate requested `scopes` against workspace policy and `disabledMcpTools`
  - generate cryptographically-random token (e.g., `crypto.randomBytes(32).toString('hex')`)
  - store only `tokenHash` (HMAC-SHA256 or SHA-256 with server salt) in `mcp_connection_tokens` with `expiresAt`, `singleUse: true`, `generatedByUserId` and `scopes`
  - return the raw token in the response only once

### `POST /api/v1/workspaces/:workspaceId/mcp/connection/revoke`
- Auth: owner/admin or user who generated the token
- Body: `{ "tokenId": "<id>" }` or revoke all for workspace
- Action: mark token `status = revoked` and record `revokedAt`

### `POST /api/v1/workspaces/:workspaceId/mcp/connection/refresh`
- Use sparingly — prefer re-issue of a new one-time token via the same UI.

### Token usage (MCP request)
- Client sends `Authorization: Bearer <token>` and `X-Workspace-Id: <workspaceId>` to `POST /api/v1/mcp/sse`.
- The server must validate token by hashing incoming token and comparing to stored `tokenHash` using constant-time comparison; ensure `expiresAt` not passed and `status` is `active` and not `used`.
- If `singleUse`, mark `usedAt` upon first successful validation and reject subsequent attempts.
- Bind the connection to `workspaceId` exactly and proceed to normal MCP request handling.

## 7. Token Storage & Cryptographic Hygiene
- Generate tokens with at least 256 bits of entropy.
- Store only `tokenHash` (use HMAC-SHA256 with a server-side KMS-backed secret or Argon2/bcrypt if you prefer slow hashing). Example:
  - `tokenHash = HMAC_SHA256(KMS_KEY, token)` and store `tokenHash`.
- Use constant-time comparison for validation to avoid timing leaks.
- Use KMS to encrypt any DB fields holding token-related secrets or rotation keys.
- TTL recommendation: 5–10 minutes for one-time tokens. Provide organization policy to configure.
- Use `singleUse: true` default; allow `singleUse: false` only with explicit policy and short TTL.

## 8. RBAC and Authorization Model
- UI-level visibility:
  - Show the `Connect external AI` action to any authenticated workspace member by default.
  - Optionally restrict via role check (owner/admin) controlled by workspace settings (e.g., `workspaceSettings.allowExternalAgents`).
- Server-side enforcement (non-negotiable):
  - The `POST /api/v1/workspaces/:workspaceId/mcp/connection` endpoint MUST validate `isWorkspaceMember(workspaceId, actorUserId)` and any role requirements.
  - The MCP transport (`POST /api/v1/mcp/sse`) must validate token → workspace binding and apply `getDisabledTools`.
- Least-privilege scoping:
  - Token `scopes` must be explicit, minimally necessary, and the MCP handler must honor them. Prefer issuing `tools/call:{specific_tool}` rather than global `tools/call` if possible.

## 9. UI Component & Client Implementation Notes
Suggested client changes (paths are approximate):
- Add `WorkspaceMcpModal` component at `client/src/modules/workspaces/components/WorkspaceMcpModal.tsx`.
- Add `useWorkspaceMcp` hook at `client/src/hooks/useWorkspaceMcp.ts` to call the connection endpoints.
- Add `Connect external AI` button into `client/src/modules/workspaces/components/WorkspaceHeader.tsx` or `client/src/pages/WorkspacePage/WorkspacePage.tsx` header area.
- Modal behavior:
  - Confirm controls and scope selector (read-only or adjustable depending on policy)
  - `POST` to server and show generated payload
  - Show copy button and a dismiss button; hide the raw token after dismiss
  - Expose a Revocation link that calls `POST /connection/revoke`

Accessibility & UX:
- Ensure the modal is keyboard accessible and properly labeled
- Provide clear microcopy explaining the security implications
- Provide an "Advanced" link for owners to view active tokens for the workspace in the workspace admin area

## 10. Observability, Logging & Auditing
Log these events with high fidelity (do not log raw token values):
- token generation: `workspaceId`, `generatedByUserId`, `scopes`, `expiresAt`, `tokenId` (no raw token)
- token usage attempts: success/fail, `sourceIp`, user agent, `workspaceId`, `tokenId`
- token revocations
- permission failures when a non-member attempts generation

Store masked token previews (e.g., `otk_4fH2x**`) only for UI convenience and never reveal full token after first display.

## 11. Failure Modes & Mitigations
- Token replay: use `singleUse: true` or detect reuse and revoke token immediately.
- Token leakage via clipboard: warn user, prefer extension-based handoff (e.g., secure channel between extension and browser) when available.
- Brute-force token guessing: enforce rate limits on `/api/v1/mcp/sse` token validation and IP-based throttling.
- Unauthorized generation: server must enforce membership and optionally role checks; audit all generation events.

## 12. Tests & QA
- Unit tests for token generation and hashing functions.
- Integration tests:
  - `POST /workspaces/:id/mcp/connection` only allows members
  - Token is usable once and then rejected
  - Token bound to the same `workspaceId`
  - Revocation removes ability to use token
- E2E test covering the modal flow in the client (mock server responses)

## 13. Rollout Plan & Next Steps (implementation checklist)
1. Add DB table `mcp_connection_tokens` and migration.
2. Implement `POST /api/v1/workspaces/:workspaceId/mcp/connection` in `server/src/modules/workspaces/routes.ts` or `server/src/modules/mcp/connection.ts` (validate membership, create hashed token, return payload).
3. Add revocation endpoint.
4. Implement `WorkspaceMcpModal` and `useWorkspaceMcp` client hook.
5. Add header button in `WorkspaceHeader` to open modal.
6. Add server-side token validation logic in `server/src/modules/mcp/router.ts` to accept token-based auth for MCP transport.
7. Add tests and run CI.
8. Roll out as feature-flagged release for staged testing.

## 14. Change Hazards, Invariants & Migration
- Do not allow bypass of `McpRequestHandler` — all transports must traverse the same enforcement.
- Changing token semantics later (e.g., switching from one-time to long-lived) requires migration and revocation of existing tokens.
- Adding broad scopes expands attack surface — require explicit policy review and workspace owner consent.
## Security Hardening Checklist
Implement the following hardening controls when building the workspace UI and backend for MCP token issuance:

- Endpoint & HTTP controls
  - Use `POST` for issuance and revocation; never expose tokens in URLs or in redirects.
  - Set response headers to prevent leakage: `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, and `Content-Security-Policy` scoped to the modal.

- CSRF and session protection
  - Protect the issuance endpoint with CSRF tokens or require SameSite cookie semantics plus `Origin`/`Referer` validation.
  - Require explicit user interaction/consent in the UI before issuing a token.

- Token cryptography & storage
  - Use a KMS-managed HMAC key to compute `tokenHash = HMAC_SHA256(KMS_KEY, token)` and store `tokenHash` + `hmacKeyId` in DB; do not store raw tokens.
  - Choose at least 256 bits of entropy for raw tokens and prefer URL-safe base64 encoding.

- Atomic consumption and DB patterns
  - Consume tokens atomically. Use an UPDATE ... RETURNING or DB transaction that changes `status='used'` only when `status='active'` and `expires_at > now()`.
  - Add DB constraints and indexes on `tokenHash`, `workspaceId`, and `expiresAt` for efficient validation and cleanup.

- Key rotation & verification
  - Record `hmacKeyId` with each token to support key rotation; during verification, attempt current key then previous keys within rotation window if necessary.

- Rate limiting & abuse mitigation
  - Enforce per-user and per-workspace rate limits on issuance.
  - Enforce per-IP and per-token validation rate limits on `/api/v1/mcp/sse` to slow brute-force attempts.

- Logging & audit
  - Log creation, usage, revocation, and validation failures with `workspaceId`, `tokenId`, `generatedByUserId`, `sourceIp`, and `userAgent`. Do not log raw token values.
  - Retain audit logs according to policy and provide UI for workspace owners to review active connectors.

- UI guidance
  - Warn users about clipboard risk and prefer secure extension handoff where available.
  - Provide a `Revoke` option and a visibility page for owners showing active tokens (masked previews only).

- Tests & monitoring
  - Unit tests for hashing and verification, integration tests for atomic consumption, and E2E tests for the modal flow.
  - Add alerts for abnormal token generation or validation failure spikes.

## 15. Related Docs
- [Link-Based MCP Connection](../mcp/LINK_BASED_MCP_CONNECTION.md)
- [MCP and Agent Interactions](../mcp/MCP_FLOW.md)
- `server/src/modules/mcp/router.ts` (MCP HTTP transport)
- `client/src/modules/workspaces/components/WorkspaceHeader.tsx` (workspace header UI)

---

This document is intentionally prescriptive: follow the server-side guards exactly as written and prefer secure defaults (short TTL, single-use tokens, hashed storage, KMS for secrets). If you'd like, I can now scaffold the client modal component and the server endpoint stubs next.