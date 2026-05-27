# Server MCP Module

## 1. Purpose and Scope
The `mcp` module (`server/src/modules/mcp/`) serves as the core framework implementation of the Model Context Protocol (MCP). It handles stdio transport connections, routes standard JSON-RPC MCP requests (such as `tools/list` and `tools/call`), evaluates context authorization, and dynamically dispatches executions to domain-specific tool handlers registered by other modules.

## 2. Non-Goals or Boundary Limits
- Does not contain the actual business logic for querying tickets or listing workspace members (these are owned by their respective domain modules).
- Strictly focuses on the protocol, transport layer, and dispatching mechanisms.

## 3. Entry Points
- **System Transport**: `src/modules/mcp/stdio.ts` boots the StdioServerTransport.
- **Global Router**: `src/modules/mcp/router.ts` builds the MCP-compliant JSON-RPC router.

## 4. Flow Steps
1. **Connection Initialization**: A client connects via stdio. The stdio transport resolves trusted context from the process environment using `MCP_STDIO_WORKSPACE_ID` and `MCP_STDIO_ACTOR_USER_ID`.
2. **Request Reception**: The router intercepts JSON-RPC requests (`tools/list`, `tools/call`).
3. **Context Resolution**: `resolveMcpContext` verifies the trusted context and actor ID using the transport-specific source; header parsing applies to the HTTP router path, while stdio uses the resolved stdio configuration.
4. **Tool Dispatch**: `executeTool` matches the requested tool name against the `toolHandlers` registry and delegates the arguments to the target handler.

## 5. Data Stores and Resources
- Reads `workspace_settings` via `getDisabledTools` to dynamically remove deactivated tools from the `tools/list` output.
- Operates primarily in-memory using `McpStateMap` to maintain session-specific contexts.

## 6. Interfaces and Contracts
- **Stdio Transport**: Listens to `process.stdin` and writes to `process.stdout`.
- **JSON-RPC Schema**: Uses TypeScript-defined MCP request and response types in `src/modules/mcp/types.ts`; this module does not document runtime zod schema enforcement.
- **Tool Registry**: Other modules must expose handlers matching the `ToolHandler` interface. These are dynamically registered during application boot via `registerToolHandlers` and `registerMcpTools` rather than being hardcoded into the MCP module.

## 7. Key Files and Modules
- `stdio.ts` & `stdio-config.ts`: Transport lifecycle and configuration parsers.
- `router.ts`: The central dispatcher.
- `tool-executor.ts`: Evaluates tool executions safely.
- `request-context.ts`: Authorizes cross-tenant MCP calls.
- `tool-handlers/registry.ts` & `tools.ts`: The central dynamic registries holding loaded handlers and tool metadata. Handlers are injected at startup to prevent circular dependencies.
- `index.ts`: The barrel file for the `mcp` module API.

## 8. Permissions, Guards, or Tenant Boundaries
- **Context Integrity**: The MCP router mandates that an explicit `workspaceId` is established. Domain handlers trust this context to isolate resources (tenant boundary).
- **Tool Disablement**: Enforces `disabled_mcp_tools` defined by workspace owners.

## 9. Failure Modes, Observability, or Operational Notes
- Custom JSON-RPC error responses (`createMcpErrorResponse`) gracefully handle invalid arguments or missing permissions without crashing the stdio process.

## 10. Change Hazards, Invariants, or Migration Constraints
- Modifying the generic `ToolExecutionContext` interface will cascade changes into every domain module that registers an MCP tool.

## 11. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
