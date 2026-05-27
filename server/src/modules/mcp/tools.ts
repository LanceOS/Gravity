import { McpToolDefinition } from './types.js';

/**
 * @description Canonical tool metadata returned by MCP tools/list. Keep this
 * aligned with the executable registry so clients never see tools that cannot
 * be dispatched.
 */
export const mcpToolsList: McpToolDefinition[] = [];

export function registerMcpTools(tools: McpToolDefinition[]) {
  mcpToolsList.push(...tools);
}
