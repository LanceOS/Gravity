import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workspaceMembers } from '../db/schema.js';
import { McpContext } from './types.js';

/**
 * Enforces the shared workspace membership check used by non-HTTP MCP entry
 * points and any handler path that has not already validated access.
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
