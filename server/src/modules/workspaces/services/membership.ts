import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { workspaceMembers, projects } from '../schema.js';
import type { Request } from 'express';
import { resolveRequestActorUserId } from '../../auth/utils/request-auth.js';

/**
 * Checks if a user is a member of a specific workspace.
 */
export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const membershipRows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
    
  return membershipRows.length > 0;
}

/**
 * Gets the workspace ID associated with a project, if the project exists.
 */
export async function getProjectWorkspaceId(projectId: string): Promise<string | null> {
  const projectRows = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
    
  return projectRows[0]?.workspaceId ?? null;
}

/**
 * Ensures the requester is authenticated and a member of the workspace that owns the project.
 */
export async function authorizeProjectAccess(req: Request, projectId: string) {
  const userId = await resolveRequestActorUserId(req);
  if (!userId) {
    return { allowed: false as const, error: 'Authentication required.', status: 401 };
  }
  const workspaceId = await getProjectWorkspaceId(projectId);
  if (!workspaceId) {
    return { allowed: false as const, error: 'Project not found.', status: 404 };
  }
  const isMember = await isWorkspaceMember(workspaceId, userId);
  if (!isMember) {
    return { allowed: false as const, error: 'Access denied: not a member of the workspace.', status: 403 };
  }
  return { allowed: true as const, userId };
}
