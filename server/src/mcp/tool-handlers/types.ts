export type ToolExecutionContext = {
  workspaceId: string;
  actorUserId: string;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<unknown>;
