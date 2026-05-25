import { toolHandlers } from './tool-handlers/registry.js';

/**
 * Resolves a tool name against the registry and executes it with the trusted
 * workspace and actor context assembled by the transport/handler pipeline.
 */
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
