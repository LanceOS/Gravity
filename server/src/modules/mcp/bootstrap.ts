import { registerToolHandlers, toolHandlers } from './tool-handlers/registry.js';
import { mcpToolsList, registerMcpTools } from './tools.js';
import { ticketToolDefinitions, ticketToolHandlers } from '../tickets/mcp.js';
import { workspaceToolDefinitions, workspaceToolHandlers } from '../workspaces/mcp.js';

/** Both transports bootstrap the same catalog and handlers. Safe to repeat. */
export function bootstrapMcpRegistries() {
  registerToolHandlers({ ...ticketToolHandlers, ...workspaceToolHandlers });
  registerMcpTools([...ticketToolDefinitions, ...workspaceToolDefinitions]);
  for (const definition of mcpToolsList) {
    if (!Object.hasOwn(toolHandlers, definition.name)) {
      throw new Error(`MCP tool has no handler: ${definition.name}`);
    }
  }
}
