/**
 * @description Subset of the MCP JSON-RPC payload used by this server.
 */
export type McpRequestPayload = {
  jsonrpc?: '2.0';
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    workspaceId?: string;
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    clientInfo?: Record<string, unknown>;
    cursor?: string;
  };
  id?: string | number | null;
};

/**
 * @description Trusted execution context forwarded to MCP handlers.
 */
export type McpContext = {
  workspaceId: string;
  actorUserId: string;
};

/**
 * @description Tool metadata exposed to MCP clients during discovery.
 */
export type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  format?: string;
  default?: unknown;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object'; properties: Record<string, JsonSchema> };
  outputSchema?: JsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  aliases?: string[];
  permission?: string;
};
