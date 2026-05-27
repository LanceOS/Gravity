import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { workspaceMembers, projects } from '../schema.js';

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
