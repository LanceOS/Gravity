import type { McpContext } from './types.js';

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

/** Read once per embedded session; request parameters cannot change these guards. */
export function getMcpStdioHandshakeConfig(config: NodeJS.ProcessEnv = process.env) {
  const positiveInteger = (name: string, fallback: number) => {
    const raw = config[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
    return value;
  };
  return {
    enabled: config.MCP_STDIO_ALLOW_HANDSHAKE === 'true',
    maxAttempts: positiveInteger('MCP_STDIO_HANDSHAKE_MAX_ATTEMPTS', 20),
    windowMs: positiveInteger('MCP_STDIO_HANDSHAKE_WINDOW_MS', 60_000),
  };
}
