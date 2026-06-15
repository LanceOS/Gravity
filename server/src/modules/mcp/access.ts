import type { McpContext } from './types.js';
import { isWorkspaceMember } from '../workspaces/services/membership.js';

/**
 * @description Enforces the shared workspace membership check used by non-HTTP
 * MCP entry points and any handler path that has not already validated access.
 * @param context Trusted MCP workspace and actor context.
 * @return Resolves when the actor is allowed to access the workspace.
 * @throws When the workspace id is missing, the actor is missing, or the actor
 * is not a workspace member.
 */
export async function assertMcpWorkspaceAccess(context: McpContext) {
  if (!context.workspaceId) {
    throw new Error('workspaceId is required.');
  }

  if (!context.actorUserId) {
    throw new Error('Authenticated user is required.');
  }

  const isMember = await isWorkspaceMember(context.workspaceId, context.actorUserId);
  if (!isMember) {
    throw new Error('Unauthorized workspace access.');
  }
}
