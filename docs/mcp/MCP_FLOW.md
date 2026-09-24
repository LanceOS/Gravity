# MCP and agent interactions

Gravity shares tool definitions and execution policy across external MCP clients, built-in AI chat, and browser WebMCP. The current catalog advertises 38 canonical tools; compatibility aliases remain callable. This document describes the implementation after the September 23, 2026 repairs. See [Transports](TRANSPORTS.md) for client configuration and token lifecycle details, and the [implementation review](IMPLEMENTATION_REVIEW_2026-09-23.md) for historical findings and remaining limits.

## Entry points and execution

| Entry point | Path to the shared executor |
| --- | --- |
| External HTTP MCP | `POST /api/v1/mcp` → session/connection-token authentication → JSON-RPC handler → executor |
| ChatGPT / OAuth MCP | `POST /api/v1/workspaces/:workspaceId/mcp` → workspace-bound OAuth token → JSON-RPC handler → executor |
| Standalone stdio | `npm run --silent -w server mcp` → trusted environment context → JSON-RPC handler → executor |
| Built-in AI chat | Chat service → provider tool call → executor |
| Browser WebMCP | Browser-discovered tool → authenticated HTTP MCP request → JSON-RPC handler → executor |

`POST /api/v1/mcp/sse` remains a compatibility alias for the HTTP endpoint. Both URLs implement stateless Streamable HTTP with JSON responses. They do not establish a legacy SSE transport. Application realtime SSE is separate. Initialization negotiates a supported protocol version; notifications have no JSON-RPC response, and HTTP notifications return 202. GET and DELETE return 405 because there is no server-initiated stream or session resource.

The standalone entry point is `server/src/modules/mcp/stdio.ts`, compiled to `server/dist/modules/mcp/stdio.js`. It initializes the database and registry before serving newline-delimited JSON-RPC. Startup, audit, and diagnostic logs go to stderr. Its trusted workspace/actor settings come from `MCP_STDIO_WORKSPACE_ID` and `MCP_STDIO_ACTOR_USER_ID`; request arguments cannot override identity.

Built-in chat calls the executor directly rather than manufacturing JSON-RPC requests. External transports and browser tools use `McpRequestHandler`. All of these paths pass through `executeTool`, where runtime argument validation and policy enforcement happen before a domain handler is invoked.

## Catalog, schemas, and permissions

`server/src/modules/mcp/bootstrap.ts` registers domain definitions and handlers for both transports. `tools.ts` normalizes metadata, groups compatibility aliases, and exposes canonical discovery. `validation.ts` compiles strict JSON Schemas without coercion or silent argument removal. `policy.ts` checks workspace access, disabled tools, and exact or broad connection scopes on every execution.

Workspace settings and the external-connection modal use GET `/api/v1/workspaces/:workspaceId/mcp/tools`. This catalog includes schemas, aliases, read/write/destructive annotations, exact scopes, and whether the current user can grant a capability. MCP `tools/list` includes only canonical tools that are enabled and callable by that credential. Workspace settings still recognize old names, and disabling a canonical tool blocks its aliases. Disabling `update_ticket` also blocks its focused mutation tools; generic updates cannot bypass disabled focused field operations.

The canonical catalog is:

| Capability | Tools |
| --- | --- |
| Context and discovery | `get_workspace`, `list_projects`, `get_project`, `list_teams`, `list_cycles`, `list_ticket_options`, `list_project_assignees`, `list_workspace_members` |
| Ticket reads | `list_tickets`, `search_tickets`, `get_ticket` |
| Ticket creation, broad update, deletion | `create_ticket`, `update_ticket`, `delete_ticket` |
| Focused ticket mutations | `edit_ticket_content`, `set_ticket_status`, `set_ticket_priority`, `assign_ticket`, `unassign_ticket`, `set_ticket_cycle`, `clear_ticket_cycle`, `set_ticket_parent`, `clear_ticket_parent`, `set_ticket_pr`, `move_ticket` |
| Labels | `list_workspace_labels`, `get_ticket_labels`, `add_ticket_labels`, `remove_ticket_labels`, `set_ticket_labels` |
| Dependencies | `mark_ticket_blocked`, `unmark_ticket_blocked`, `preview_ticket_dependency`, `list_ticket_dependencies` |
| Comments | `create_comment`, `read_comments`, `update_comment`, `delete_comment` |

`get_ticket_details` and `read_ticket_details` share the `get_ticket` capability. `add_comment` aliases `create_comment`; dependency add/remove aliases retain their legacy input schemas. New clients should prefer canonical names and explicit blocker/dependent keys for directional dependency changes.

The catalog is the authoritative source for tool names and schemas. Add new definitions and handlers together, declare compatibility aliases deliberately, and ensure every execution route reaches the shared executor. Tool annotations describe behavior; the server-side policy, rather than annotations alone, grants access.

## Credentials and workspace boundaries

HTTP requests use authenticated session cookies or a workspace-bound bearer credential, with `X-Workspace-Id` identifying the workspace. For compatibility, the transport accepts `params.workspaceId`; conflicting workspace IDs in tool calls are rejected. Credentials execute as their issuer, not as a privileged agent account.

Connection credentials are reusable by default, expire after 24 hours by default, and are not IP-bound unless requested. Omitting scopes creates a discovery-only credential. The UI selects exact tool scopes, defaults to read-only tools, offers expiry selection, and exports endpoint plus authorization/workspace headers. It also lists and revokes connections. Explicit single-use tokens remain supported for one-off calls and cannot complete an ordinary multi-request client lifecycle.

Connection management lives in **Account Preferences → Connect External AI**, with your own connections grouped across accessible workspaces. The account metadata endpoint is `GET /api/v1/users/me/mcp/connections`; it filters by authenticated issuer and fresh membership, even for workspace administrators. The setup dialog offers copyable fields, JSON export for custom-header clients, and a separate ChatGPT OAuth setup path.

OAuth uses a workspace-specific resource URL, so ChatGPT needs no custom workspace header. The official MCP SDK handles authorization-code/PKCE protocol endpoints; Gravity supplies durable client, consent, grant, and hashed-token storage. Users sign in through the existing account session, review the client callback and workspace, and approve a subset of allowed tool scopes. A grant lasts 30 days, with one-hour access tokens and rotating refresh tokens. The same account revoke control ends both access and renewal. See [OAuth setup and deployment](TRANSPORTS.md#oauth-transport).

Workspace members can issue exact read-only scopes. Owner/admin permission is required for write scopes or the broad `tools/call` / `tools/call:*` grants. Execution rechecks write-credential role eligibility. Credentials do not currently support narrower project-specific grants. MCP transport/execution access reads current database membership rather than the application membership cache. Stdio token sessions also recheck issuer access; write-role checks read current membership directly. Token verification atomically matches the observed token hash so refresh invalidates stale credentials even when verification races with rotation.

Domain services independently constrain referenced resources. Ticket cycles must belong to the project's team. Parents must belong to the same project, and self/ancestor cycles are rejected under project locks. Moving a ticket within its workspace detaches its parent and direct children, clears incompatible cycles/labels, and validates the retained assignee against the destination. Cross-workspace moves fail. These rules apply to service callers beyond MCP as well.

## Arguments, results, and stable references

Omitted update fields preserve existing values. Explicit null clears supported nullable fields, while focused unassign/clear tools expose that intent separately. Labels have stable IDs, names, scope, color, and description. Typed `labelIds` arrays are preferred; legacy `labels` strings remain supported. An explicit empty replacement clears labels, while a missing or incorrectly typed replacement fails before mutation. Additive and subtractive label operations target exact IDs to preserve concurrent independent changes.

`list_tickets` returns an array with a default limit of 50 and maximum of 100; `offset` selects later pages. `search_tickets` returns `{ tickets, nextCursor, scope }` and supports project, team, text, workflow, assignee, cycle, label, parent, and date filters. Ordering is creation time followed by ID. A cursor is offset-based and should be reused with the same filters; it does not freeze the underlying dataset.

Successful MCP tool results include text plus `structuredContent: { data: ... }`. Domain execution failures use `isError: true` and structured error information. Invalid tool arguments, unknown tools, and authorization failures are JSON-RPC errors. Output schemas currently describe the common envelope rather than every nested domain object.

Stable authorized database IDs are the default and work across replicas. Optional legacy `X-MCP-Sanitize: true` references are scoped by workspace/actor, bounded, and expire after one hour of inactivity. They remain process-local and are not an authorization boundary.

## Chat and browser behavior

`server/src/modules/chats/services/chat-service.ts` presents enabled canonical tools to the configured provider and forwards model-selected calls to the executor. It retains function names and call IDs with results. Saved exchanges reconstruct assistant calls and tool-role data on subsequent turns; ticket/comment content is never promoted to a system instruction. Only the application-generated system prompt receives the system role.

Provider adapters live under `server/src/modules/ai/providers/`. Gemini uses JSON Schema declarations through `parametersJsonSchema`, includes function names in responses, groups parallel responses in one user turn, and preserves original provider call IDs/parts/signatures for replay. Provider payload tests do not constitute live external-model validation.

Browser registration lives in `client/src/utils/webmcp.ts`. It discovers tools from the server and registers them through `document.modelContext`. The browser executes authenticated MCP requests and resolves only after receiving the server result, including `isError`; it no longer reports success based on an unfinished optimistic React action or reads an active-project cache as if it were the workspace.

The September 17, 2026 WebMCP draft supports `registerTool(tool, { signal })`. Cleanup aborts that signal; an explicit `unregisterTool` method is not required. Gravity calls the older method only when available as a compatibility fallback. Per-call cancellation is combined with registration lifetime cancellation. [WebMCP registration options](https://webmachinelearning.github.io/webmcp/#dictdef-modelcontextregistertooloptions).

## Realtime mutation delivery

Ticket, comment, label, dependency, and subtask handlers publish typed events through `server/src/lib/mcp-event-bus.ts`. `server/src/realtime.ts` forwards them to workspace-scoped application SSE subscribers. Events contain type, workspace/project/team IDs, ticket key, actor ID, timestamp, and mutation-specific data.

The client invalidates/refetches affected data and coalesces bursts. It accepts same-user events because external clients and other tabs can write on that user's behalf. An actor match alone does not establish that the current tab already applied a mutation.

When Redis is enabled, `server/src/lib/mcp-event-bridge.ts` relays events across HTTP, stdio, and other HTTP processes. Origin IDs and bounded duplicate tracking prevent echo loops. Remote messages reach local subscribers without being published again. Pending publications are bounded, Redis failures leave local delivery available, and startup/shutdown hooks own dedicated pubsub clients.

Channels include the logical database from `REDIS_URL` (database `0` when omitted) and `MCP_EVENT_NAMESPACE` (default `default`). Set a distinct `MCP_EVENT_NAMESPACE` for deployments that share the same Redis database, and use the same value for HTTP replicas and their stdio clients. Credentials and hostnames are never included in channel names. This explicit boundary is required because Redis Pub/Sub itself ignores database numbers. Standalone stdio closes its bridge, shared Redis client, and database pool on stdin EOF, SIGINT, and SIGTERM.

The bridge is best-effort pubsub, with no outbox, durable replay, or delivery guarantee while disconnected. Consumers must reload current state after reconnecting. Without Redis, notifications remain process-local. Bridge regression tests use fake adapters; a live Redis check additionally verified relay between matching processes and isolation across logical databases and deployment namespaces. Full application delivery across multiple HTTP replicas remains a deployment check.

## Key files and verification

| File | Responsibility |
| --- | --- |
| `server/src/modules/mcp/bootstrap.ts` | Shared registry initialization |
| `server/src/modules/mcp/tools.ts` | Catalog, canonical names, aliases, metadata |
| `server/src/modules/mcp/validation.ts` | Strict runtime input schemas |
| `server/src/modules/mcp/policy.ts` | Execution-time workspace, scope, and capability rules |
| `server/src/modules/mcp/router.ts` | HTTP transport and authentication |
| `server/src/modules/mcp/oauth.ts` | OAuth registration, discovery, consent, token exchange, refresh, and verification |
| `server/src/modules/mcp/stdio.ts`, `stdio-session.ts` | Standalone startup, lifecycle, and framing |
| `server/src/modules/mcp/request-handler.ts` | JSON-RPC lifecycle and result/error translation |
| `server/src/modules/mcp/tool-executor.ts` | Validated, authorized handler dispatch |
| `server/src/modules/tickets/mcp.ts`, `workspaces/mcp.ts` | Domain tool definitions and handlers |
| `server/src/modules/tickets/services/tickets.ts` | Shared ticket persistence and reference constraints |
| `server/src/modules/chats/services/chat-service.ts` | Provider loop and trusted-role reconstruction |
| `client/src/utils/mcp.ts`, `webmcp.ts` | Browser discovery, configuration export, and execution |
| `client/src/modules/accountPreferencesPage/components/sections/ExternalAiSection.tsx` | Account-wide connection management |
| `client/src/modules/mcpOAuth/OAuthConsentPage.tsx` | Authenticated workspace/tool consent |

The official SDK transport tests (`mcp-transport-lifecycle.test.ts` and `mcp-stdio-sdk.test.ts`) exercise discovery and a write/read round trip over actual transport boundaries. Separate suites cover schema/policy enforcement, aliases, relationship safety, pagination, labels, provider payloads/history, registration cleanup, same-user realtime updates, and event bridging. Final aggregate test totals belong to the repair run's validation report rather than this architecture document.
