# MCP Connection Token Scope Semantics

Purpose
- Summarize scopes used by short-lived connection tokens and how they are enforced.

Token binding & lifecycle
- Tokens are bound to a single workspace at issuance and verified server-side.
- Tokens are short-lived (default TTL = 5 minutes), and are single-use by default (configurable to multi-use).
- Raw tokens are never stored; the server stores an HMAC hash plus a key id to support rotation.
- Revocation and single-use consumption are enforced in `server/src/modules/mcp/connection.ts`.

Supported scopes
- `tools/list` — allows calling the `tools/list` JSON-RPC method to enumerate available tools.
- `tools/call` — global permission to call any tool via `tools/call`.
- `tools/call:<toolName>` — granular permission to call a specific tool only (e.g. `tools/call:list_tickets`).
- Wildcards: `tools/call:*` is treated as equivalent to `tools/call` (global call permission).

Enforcement
- Enforcement is centralized in the MCP JSON-RPC handler: `server/src/modules/mcp/request-handler.ts`.
  - When a transport passes `tokenScopes` to the handler it enforces per-method checks and returns a JSON-RPC error with code `-32001` and message `Insufficient token scopes.` on failure.
  - Transports (HTTP, stdio) are responsible for authenticating the client and binding a trusted `workspaceId` and `actorUserId`, and for passing any `tokenScopes` to the handler. The HTTP router verifies token authenticity and workspace binding.

Client guidance (UI/help)
- When requesting a connection token, clients should list the requested scopes and show a brief human-friendly explanation:
  - `tools/list`: "Allows the external AI to list the workspace's available MCP tools."
  - `tools/call`: "Allows the external AI to invoke any MCP tool." (or use `tools/call:<tool>` for a specific tool).
- Display expiry details: "This link is valid for 5 minutes and is single-use by default."
- If the UI lets users choose scopes, recommend granting the minimal necessary scope (prefer per-tool `tools/call:<tool>` over global `tools/call`).

Implementation notes
- HMAC rotation: verification accepts tokens signed with current and recent/old secrets to allow key rotation; see `server/src/env.ts` and `server/src/modules/mcp/connection.ts`.
- Error handling: scope failures are returned in JSON-RPC envelope (not as HTTP 4xx responses) so clients using the MCP protocol receive the expected error code and message.

Next steps
- Update the client UI to display these scopes when issuing a connection token and include a help link to this document.
- Optionally add an example dialog showing minimal scopes for common integrations.
