import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  authUsers,
  workspaces,
  userProfiles,
  workspaceMemberActivity,
  workspaceMembers,
} from '../../db/schema.js';
import { createWorkspaceScopeViolationError } from '../mcp/scope.js';
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
    const requestedWorkspaceId = typeof args.workspaceId === 'string' ? args.workspaceId.trim() : '';
    const workspaceId = requestedWorkspaceId || context.workspaceId;

    if (!workspaceId) {
      throw new Error('workspaceId is required.');
    }

    if (workspaceId !== context.workspaceId) {
      throw await createWorkspaceScopeViolationError(context.workspaceId, {
        action: 'list_workspace_members',
        requestedWorkspaceId,
        actorUserId: context.actorUserId,
      });
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

    const workspaceOwnerRows = await db
      .select({ ownerId: workspaces.createdBy })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const ownerId = workspaceOwnerRows[0]?.ownerId;

    let normalizedMembers = members.map((member) => ({
      id: member.id,
      name: member.name,
      avatar: member.avatarUrl || member.image || '',
      role: member.role,
      createdAt: member.createdAt.toISOString(),
      lastActiveAt: member.lastActiveAt?.toISOString() || null,
    }));

    if (ownerId) {
      const ownerMember = normalizedMembers.find((member) => member.id === ownerId);
      if (ownerMember) {
        if (ownerMember.role !== 'owner') {
          normalizedMembers = normalizedMembers.map((member) =>
            member.id === ownerId ? { ...member, role: 'owner' } : member,
          );
        }
      } else {
        const ownerRecords = await db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            image: authUsers.image,
            avatarUrl: userProfiles.avatarUrl,
            createdAt: workspaceMembers.createdAt,
            lastActiveAt: workspaceMemberActivity.lastActiveAt,
          })
          .from(authUsers)
          .leftJoin(
            workspaceMembers,
            and(eq(workspaceMembers.userId, authUsers.id), eq(workspaceMembers.workspaceId, workspaceId)),
          )
          .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
          .leftJoin(
            workspaceMemberActivity,
            and(eq(workspaceMemberActivity.workspaceId, workspaceId), eq(workspaceMemberActivity.userId, authUsers.id)),
          )
          .where(eq(authUsers.id, ownerId))
          .limit(1);

        const ownerRecord = ownerRecords[0];
        if (ownerRecord) {
          normalizedMembers = [
            {
              id: ownerRecord.id,
              name: ownerRecord.name,
              avatar: ownerRecord.avatarUrl || ownerRecord.image || '',
              role: 'owner',
              createdAt: ownerRecord.createdAt ? ownerRecord.createdAt.toISOString() : new Date().toISOString(),
              lastActiveAt: ownerRecord.lastActiveAt ? ownerRecord.lastActiveAt.toISOString() : null,
            },
            ...normalizedMembers,
          ];
        }
      }
    }

    return normalizedMembers;
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
    },
  },
];
