# Gravity browser MCP bridge

Gravity registers browser tools on `document.modelContext` when that API is available. The browser bridge discovers the canonical callable catalog from `POST /api/v1/mcp` using the signed-in session and the selected workspace's `X-Workspace-Id` header.

Every browser tool calls the same server endpoint and awaits its result. The server validates arguments, workspace access, tool disablement, and mutation permissions. Browser tools do not read an active project's cached ticket list or report optimistic UI mutations as successful. Tool results retain MCP `content`, `structuredContent`, and `isError` fields.

The workspace hook cancels discovery and execution requests when its workspace changes or it unmounts. Registration uses `registerTool(tool, { signal })`; cleanup aborts that signal. An optional `unregisterTool(name)` call also supports older implementations. Partial registration failures clean up all tools already registered by the bridge.

The API follows the [WebMCP draft dated September 17, 2026](https://webmachinelearning.github.io/webmcp/), including `document.modelContext`, registration cancellation via `AbortSignal`, and execution cancellation. Browser support remains experimental; feature detection keeps the application usable when WebMCP is unavailable.

## Server-driven settings and external connections

Workspace MCP settings load the full catalog from `GET /api/v1/workspaces/:workspaceId/mcp/tools`, including disabled tools. Canonical names and compatibility aliases share one enablement control.

The external connection dialog reads the same catalog and offers read-only, read/write, or individual tool selection. It requests explicit `tools/call:<name>` scopes plus discovery, creates a reusable connection, and exports the endpoint and bearer credential together as client configuration. Clipboard failures preserve the configuration. Credentials are cleared when the dialog closes or the workspace changes; existing connections can be listed and revoked.

## Implementation

- `src/utils/mcp.ts`: MCP request and client-configuration helpers.
- `src/utils/webmcp.ts`: browser feature detection, registration, execution, cleanup.
- `src/modules/workspaceShellPage/hooks/useWebMcpRegistration.ts`: workspace lifecycle.
- `src/hooks/useMcpCatalog.ts`: full registry metadata for settings and connections.
- `src/modules/settings/components/McpToolsSection.tsx`: registry-driven enablement.
- `src/modules/workspaces/components/WorkspaceMcpModal.tsx`: scoped connection management.

## Validation

Targeted browser, catalog, connection, settings, and realtime tests live under `src/test` and `src/context/realtime/__tests__`. Browser API tests simulate both signal-only implementations and older explicit unregister implementations; they do not require an experimental browser.

On Node 26, disable its ambient web storage when running jsdom tests so jsdom owns `localStorage`:

```sh
NODE_OPTIONS=--no-experimental-webstorage npm run -w client test -- src/test/utils/webmcp.test.tsx src/test/hooks/useMcpCatalog.test.tsx src/test/components/WorkspaceMcpModal.test.tsx src/test/pages/SettingsPages.test.tsx src/context/realtime/__tests__/RealtimeContext.test.tsx
```
