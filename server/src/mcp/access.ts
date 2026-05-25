import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workspaceMembers } from '../db/schema.js';
import { McpContext } from './types.js';

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

  // Workspace membership is the source of truth for MCP tool access.
  const membershipRows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.workspaceId),
        eq(workspaceMembers.userId, context.actorUserId),
      ),
    )
    .limit(1);

  if (membershipRows.length === 0) {
    throw new Error('Unauthorized workspace access.');
  }
}
