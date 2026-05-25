/**
 * Trusted execution context shared by all tool handlers.
 */
export type ToolExecutionContext = {
  workspaceId: string;
  actorUserId: string;
};

/**
 * Function signature every MCP tool implementation must satisfy.
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<unknown>;
