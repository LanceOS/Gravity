import type { McpContext } from './types.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { workspaces, workspaceMembers } from '../workspaces/schema.js';

/** Fresh roles are required for both execution and connection administration. */
export async function getMcpWorkspaceRole(workspaceId: string, userId: string, query: Pick<typeof db, 'select'> = db): Promise<string | null> {
  if (!workspaceId || !userId) return null;
  const [row] = await query.select({ ownerId: workspaces.createdBy, role: workspaceMembers.role })
    .from(workspaces)
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)))
    .where(eq(workspaces.id, workspaceId)).limit(1);
  if (!row) return null;
  return row.ownerId === userId ? 'owner' : row.role;
}

/** MCP credentials must stop granting access immediately after issuer removal. */
export async function isMcpWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  return await getMcpWorkspaceRole(workspaceId, userId) !== null;
}

export interface WorkspaceMembershipChecker {
  isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean>;
}

export interface McpWorkspaceAccessDependencies {
  workspaceMembershipChecker?: WorkspaceMembershipChecker;
}

export class McpWorkspaceAccessService {
  private readonly checker: WorkspaceMembershipChecker;

  constructor(dependencies: McpWorkspaceAccessDependencies = {}) {
    this.checker = dependencies.workspaceMembershipChecker ?? { isWorkspaceMember: isMcpWorkspaceMember };
  }

  async hasWorkspaceAccess(workspaceId: string, actorUserId: string): Promise<boolean> {
    return this.checker.isWorkspaceMember(workspaceId, actorUserId);
  }

  /**
   * @description Enforces the shared workspace membership check used by non-HTTP
   * MCP entry points and any handler path that has not already validated access.
   * @param context Trusted MCP workspace and actor context.
   * @return Resolves when the actor is allowed to access the workspace.
   * @throws When the workspace id is missing, the actor is missing, or the actor
   * is not a workspace member.
   */
  async assertWorkspaceAccess(context: McpContext) {
    if (!context.workspaceId) {
      throw new Error('workspaceId is required.');
    }

    if (!context.actorUserId) {
      throw new Error('Authenticated user is required.');
    }

    const isMember = await this.hasWorkspaceAccess(context.workspaceId, context.actorUserId);
    if (!isMember) {
      throw new Error('Unauthorized workspace access.');
    }
  }
}

const defaultWorkspaceAccessService = new McpWorkspaceAccessService();

/**
 * @description Enforces the shared workspace membership check used by non-HTTP
 * MCP entry points and any handler path that has not already validated access.
 * @param context Trusted MCP workspace and actor context.
 * @return Resolves when the actor is allowed to access the workspace.
 * @throws When the workspace id is missing, the actor is missing, or the actor
 * is not a workspace member.
 */
export async function assertMcpWorkspaceAccess(context: McpContext) {
  await defaultWorkspaceAccessService.assertWorkspaceAccess(context);
}
