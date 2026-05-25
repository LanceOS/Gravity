/**
 * Subset of the MCP JSON-RPC payload used by this server.
 */
export type McpRequestPayload = {
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    workspaceId?: string;
  };
  id?: string | number | null;
};

/**
 * Trusted execution context forwarded to MCP handlers.
 */
export type McpContext = {
  workspaceId: string;
  actorUserId: string;
};

/**
 * Tool metadata exposed to MCP clients during discovery.
 */
export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string }>;
    required?: string[];
  };
};
