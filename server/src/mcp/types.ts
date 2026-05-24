export type McpRequestPayload = {
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  id?: string | number | null;
};

export type McpContext = {
  workspaceId: string;
  actorUserId: string;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string }>;
    required?: string[];
  };
};
