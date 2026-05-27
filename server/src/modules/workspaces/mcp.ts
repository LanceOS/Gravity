import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  authUsers,
  userProfiles,
  workspaceMemberActivity,
  workspaceMembers,
} from '../../db/schema.js';
import { ToolExecutionContext, ToolHandler } from '../mcp/tool-handlers/types.js';
import { McpToolDefinition } from '../mcp/types.js';

/**
 * @description Workspace-member MCP handlers. These APIs only expose members
 * from the same workspace already authorized by the transport context.
 */
export class WorkspaceMemberTools {
  /**
   * @description Lists members for the authorized workspace and returns a
   * transport-friendly response shape.
   * @param args Tool arguments containing the workspace id.
   * @param context Trusted tool execution context.
   * @return The normalized workspace member list.
   * @throws When the workspace id is missing or does not match the authorized context.
   */
  async listWorkspaceMembers(args: Record<string, unknown>, context: ToolExecutionContext) {
    const workspaceId = String(args.workspaceId ?? '');
    if (!workspaceId) {
      throw new Error('workspaceId is required.');
    }

    if (workspaceId !== context.workspaceId) {
      throw new Error('Unauthorized or workspace mismatch');
    }

    const members = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        image: authUsers.image,
        avatarUrl: userProfiles.avatarUrl,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
        lastActiveAt: workspaceMemberActivity.lastActiveAt,
      })
      .from(workspaceMembers)
      .innerJoin(authUsers, eq(authUsers.id, workspaceMembers.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, workspaceMembers.userId))
      .leftJoin(
        workspaceMemberActivity,
        and(
          eq(workspaceMemberActivity.userId, workspaceMembers.userId),
          eq(workspaceMemberActivity.workspaceId, workspaceMembers.workspaceId),
        ),
      )
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.createdAt));

    return members.map((member) => ({
      id: member.id,
      name: member.name,
      avatar: member.avatarUrl || member.image || '',
      role: member.role,
      createdAt: member.createdAt.toISOString(),
      lastActiveAt: member.lastActiveAt?.toISOString() || null,
    }));
  }
}

export const workspaceMemberTools = new WorkspaceMemberTools();

export const workspaceToolHandlers: Record<string, ToolHandler> = {
  list_workspace_members: (args, context) => workspaceMemberTools.listWorkspaceMembers(args, context),
};

export const workspaceToolDefinitions: McpToolDefinition[] = [
  {
    name: 'list_workspace_members',
    description: 'Retrieve a list of members in a workspace, including their roles and last active times.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
];
