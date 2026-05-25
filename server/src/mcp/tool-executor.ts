import { toolHandlers } from './tool-handlers/registry.js';

/**
 * @description Resolves a tool name against the registry and executes it with
 * the trusted workspace and actor context assembled by the
 * transport/handler pipeline.
 * @param name The MCP tool name requested by the client.
 * @param args Tool arguments from the JSON-RPC payload.
 * @param contextWorkspaceId Trusted workspace id for execution.
 * @param actorUserId Trusted actor id for execution.
 * @return The tool result returned by the registered handler.
 * @throws When the requested tool is not registered.
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
