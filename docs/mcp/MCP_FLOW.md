# MCP and Agent Interactions

## Purpose and Scope
This document outlines how the Gravity server implements the Model Context Protocol (MCP) to execute workspace actions, and how AI agents interact with it. Gravity runs its own internal MCP server to expose specific tools (e.g., ticket creation, workspace membership reads) that allow AI agents to securely act on behalf of a user.

## Non-Goals or Boundary Limits
- This document does not cover the inner workings of external AI providers (OpenAI, Anthropic, Gemini, Deepseek, Ollama).
- It does not map the full data model of tickets or workspaces (see related domain docs).
- Focus is on the protocol dispatch, JSON-RPC parsing, and execution bounds.

## Entry Points
Gravity exposes two distinct MCP transports:
- **HTTP/SSE Transport**: `POST /api/v1/mcp/sse` (mounted via `server/src/mcp/router.ts`). Although named "sse", the primary command channel acts as an HTTP POST JSON-RPC endpoint.
- **Stdio Transport**: Executed as a standalone process via `server/src/mcp/stdio.ts` (`node dist/src/mcp/stdio.js`), listening for line-delimited JSON-RPC messages on standard input and output.

## Flow Steps

1. **Agent Tool Formatting**: `AiService` (`server/src/lib/ai/ai-service.ts`) passes tool definitions (`mcpToolsList`) directly to configured providers (OpenAI, Anthropic, Gemini). When a provider decides to invoke a tool, it returns a tool call payload.
2. **Request Construction**: The agent, acting as an MCP client, sends a JSON-RPC request to the server (e.g., `method: "tools/call"`).
3. **Transport Authentication**:
   - For HTTP: The request is authenticated using standard session cookies via `resolveRequestActorUserId`.
   - For Stdio: The identity is rigidly bound at process startup using the `MCP_STDIO_WORKSPACE_ID` and `MCP_STDIO_ACTOR_USER_ID` environment variables.
4. **Workspace Guard**: The server mandates an `X-Workspace-Id` HTTP header or a `params.workspaceId` property. It verifies that the authenticated user actually has a valid membership in the target workspace (`workspaceMembers` table).
5. **JSON-RPC Handling**: The `McpRequestHandler` (`server/src/mcp/request-handler.ts`) processes the validated request.
6. **Tool Disabling Check**: The system cross-references the requested tool against the workspace's `disabledMcpTools` settings (retrieved via `getDisabledTools`). If disabled, an exception is thrown.
7. **Execution**: The `executeTool` function (`server/src/mcp/tool-executor.ts`) dispatches the arguments to the registered handler (`server/src/mcp/tool-handlers/registry.ts`).
8. **Response**: A JSON-RPC response containing the result or error is serialized and returned to the agent.

## Realtime Mutation Events and SSE Fan-Out

Tool handlers that mutate tickets, comments, labels, or dependencies also publish typed events to `mcpEventBus` (`server/src/lib/mcp-event-bus.ts`). The realtime service (`server/src/realtime.ts`) subscribes to that bus and broadcasts the events to workspace-scoped SSE clients. The client-side `TicketContext` then coalesces bursts of events and refetches only the data that changed.

### Event Envelope

Each SSE payload uses a consistent envelope:

- `type`: the event name, such as `ticket.created` or `comment.added`
- `workspaceId`: workspace scope for delivery
- `projectId`: project scope when the mutation is project-bound
- `teamId`: team scope when the mutation is team-bound
- `ticketKey`: the affected ticket key when applicable
- `actorUserId`: the user who triggered the mutation
- `timestamp`: ISO-8601 event timestamp
- `data`: event-specific payload

### Event Types

The current typed event set is:

- `ticket.created`: fired after a ticket is created
- `ticket.updated`: fired after ticket fields change
- `ticket.deleted`: fired after a ticket is deleted
- `comment.added`: fired after a comment is created
- `comment.updated`: fired after a comment is edited
- `comment.deleted`: fired after a comment is removed
- `labels.added`: fired after labels are attached to a ticket
- `labels.removed`: fired after labels are detached from a ticket
- `labels.set`: fired when the full label set is replaced
- `dependency.added`: fired after a ticket dependency is created
- `dependency.removed`: fired after a ticket dependency is removed

For backward compatibility, the SSE stream still accepts legacy broad-refresh events:

- `tickets-updated`
- `comments-updated`
- `users-updated`
- `init`

### Client Refresh Behavior

The current client does not fully replace local state with the SSE payload. Instead, it uses the event type to choose a targeted refresh:

- Ticket, label, and dependency events refetch the active ticket detail with relations.
- Comment events refetch the comment thread for the affected ticket.
- A coalescer batches rapid mutations so a burst of updates can collapse into one network refresh.

## Data Stores and Resources
- **`workspaceMembers`**: Read during transport validation to ensure the requesting user is a legitimate member of the workspace they are trying to act upon.
- **`workspaces` (Settings)**: Read by `workspace-tools.ts` to retrieve `disabledMcpTools`, ensuring agents cannot bypass workspace owner controls.
- **`tickets`, `projects`, `comments`**: Mutated or read by the specific tool handlers under `src/mcp/tool-handlers/`.
- **`mcpEventBus`**: The in-process mutation event bus used to bridge domain writes into the realtime SSE layer.

## Interfaces and Contracts

### `mcpToolsList` (`server/src/mcp/tools.ts`)
The source of truth for the available tools. These definitions follow standard MCP JSON Schema formats and are translated into the native tool-calling formats of various AI providers.
Examples: `list_tickets`, `create_ticket`, `add_comment`, `list_workspace_members`.

### `McpRequestHandler` (`server/src/mcp/request-handler.ts`)
The unified JSON-RPC dispatcher.
- Accepts: `McpRequestPayload` (containing `jsonrpc`, `id`, `method`, `params`).
- Returns: MCP-compliant responses (containing `result` or `error`).

## Key Files and Modules
- **`server/src/mcp/router.ts`**: The HTTP transport boundary. Handles authentication, workspace checks, and delegates to the handler.
- **`server/src/mcp/request-handler.ts`**: The protocol logic. Validates methods (`initialize`, `tools/list`, `tools/call`), processes tool filters, and calls the executor.
- **`server/src/mcp/tool-executor.ts`**: Safely looks up and invokes the right function from the tool registry.
- **`server/src/mcp/tool-handlers/registry.ts`**: Maps tool string names to actual implementation functions.
- **`server/src/lib/mcp-event-bus.ts`**: Shared mutation event definitions and publish/subscribe helpers.
- **`server/src/realtime.ts`**: Converts mutation events into client-facing SSE broadcasts.
- **`server/src/lib/ai/ai-service.ts`**: Connects AI models to tool definitions and handles the bidirectional translation.
- **`server/tests/auth-ai-mcp-webhooks.test.ts`**: Integration tests confirming that disabled tools fail and that unauthenticated/unauthorized users are denied.

## Permissions, Guards, or Tenant Boundaries
- **Strict Tenant Bound**: Every MCP execution *must* be bound to a single Workspace ID. The MCP protocol implementation fails if a workspace ID is omitted or invalid.
- **Identity Bound**: Actions execute on behalf of the `actorUserId`. The system does not use a superuser "agent" account; the agent assumes the permissions of the user driving it.
- **Workspace Tool Control**: Workspace owners can explicitly disable specific MCP tools via their workspace settings (`PATCH /api/v1/workspaces/:id/settings`). `tools/list` omits disabled tools, and `tools/call` blocks them aggressively.

## Failure Modes, Observability, or Operational Notes
- If an agent attempts to hallucinate a tool or call a disabled tool, the JSON-RPC response will contain an error object (e.g., `-32601 Method not found` or a `-32603 Internal error` wrapped exception).
- Stdio transport failures due to malformed JSON lines will emit standard JSON-RPC parse errors without crashing the stdio process listener.
- `req.body.params.workspaceId` vs `X-Workspace-Id`: The transport allows either, prioritizing the header. Ensure clients don't mistakenly send conflicting IDs.

## Change Hazards, Invariants, or Migration Constraints
- **Do not bypass the handler**: Any new transport (e.g., WebSockets) must still route through `McpRequestHandler`. It enforces tool disablement rules that should not be skipped.
- **Tool name aliases**: Notice that `add_comment` and `create_comment` are aliased in the logic (`disablementAlias`). Altering these tool names requires careful synchronization to ensure workspace disablement settings continue to function.

## Related Docs
- [Link-Based MCP Connection](LINK_BASED_MCP_CONNECTION.md)
- [Adding MCP SSE Events](ADDING_MCP_SSE_EVENTS.md)
- [Client State Management](../client/CLIENT_STATE_MANAGEMENT.md)
- [Server Architecture Overview](../server/SERVER_ARCHITECTURE_OVERVIEW.md)
