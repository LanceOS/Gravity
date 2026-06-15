import type { McpContext } from './types.js';
import { isWorkspaceMember } from '../workspaces/services/membership.js';

export interface WorkspaceMembershipChecker {
  isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean>;
}

export interface McpWorkspaceAccessDependencies {
  workspaceMembershipChecker?: WorkspaceMembershipChecker;
}

export class McpWorkspaceAccessService {
  private readonly checker: WorkspaceMembershipChecker;

  constructor(dependencies: McpWorkspaceAccessDependencies = {}) {
    this.checker = dependencies.workspaceMembershipChecker ?? { isWorkspaceMember };
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
