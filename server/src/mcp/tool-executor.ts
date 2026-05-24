import { toolHandlers } from './tool-handlers/registry.js';

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  contextWorkspaceId: string,
  actorUserId: string,
) {
  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return handler(args, {
    workspaceId: contextWorkspaceId,
    actorUserId,
  });
}
