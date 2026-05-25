import { McpContext } from './types.js';

export type McpStdioConfig = {
  mcpStdioWorkspaceId?: string;
  mcpStdioActorUserId?: string;
};

function normalizeConfigValue(value?: string) {
  return value?.trim() ?? '';
}

/**
 * @description Resolves the fixed trusted context for the stdio server and
 * fails fast when either required environment variable is missing.
 * @param config Environment-backed stdio configuration values.
 * @return The normalized trusted MCP context for the stdio transport.
 * @throws When either the trusted workspace id or actor id is missing.
 */
export function getMcpStdioContext(config: McpStdioConfig): McpContext {
  const workspaceId = normalizeConfigValue(config.mcpStdioWorkspaceId);
  const actorUserId = normalizeConfigValue(config.mcpStdioActorUserId);

  if (!workspaceId) {
    throw new Error('MCP stdio requires MCP_STDIO_WORKSPACE_ID.');
  }

  if (!actorUserId) {
    throw new Error('MCP stdio requires MCP_STDIO_ACTOR_USER_ID.');
  }

  return {
    workspaceId,
    actorUserId,
  };
}
