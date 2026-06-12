import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { workspaceMembers, projects, teams } from '../schema.js';
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

export async function getWorkspaceMemberRole(workspaceId: string, userId: string): Promise<string | null> {
  const membershipRows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);

  return membershipRows[0]?.role ?? null;
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

/**
 * Ensures the requester is authenticated and a member of the workspace.
 */
export async function authorizeWorkspaceAccess(req: Request, workspaceId: string) {
  const userId = await resolveRequestActorUserId(req);
  if (!userId) {
    return { allowed: false as const, error: 'Authentication required.', status: 401 };
  }
  const isMember = await isWorkspaceMember(workspaceId, userId);
  if (!isMember) {
    return { allowed: false as const, error: 'Access denied: not a member of the workspace.', status: 403 };
  }
  return { allowed: true as const, userId };
}

export async function authorizeWorkspaceOwnerAccess(req: Request, workspaceId: string) {
  const auth = await authorizeWorkspaceAccess(req, workspaceId);
  if (!auth.allowed) {
    return auth;
  }

  const role = await getWorkspaceMemberRole(workspaceId, auth.userId);
  if (role !== 'owner') {
    return { allowed: false as const, error: 'Only workspace owners can manage teams.', status: 403 };
  }

  return auth;
}

/**
 * Ensures the requester is authenticated and a member of the workspace that owns the team.
 */
export async function authorizeTeamAccess(req: Request, teamId: string) {
  const userId = await resolveRequestActorUserId(req);
  if (!userId) {
    return { allowed: false as const, error: 'Authentication required.', status: 401 };
  }
  const teamRows = await db
    .select({ workspaceId: teams.workspaceId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  
  const workspaceId = teamRows[0]?.workspaceId;
  if (!workspaceId) {
    return { allowed: false as const, error: 'Team not found.', status: 404 };
  }
  const isMember = await isWorkspaceMember(workspaceId, userId);
  if (!isMember) {
    return { allowed: false as const, error: 'Access denied: not a member of the workspace.', status: 403 };
  }
  return { allowed: true as const, userId };
}

export async function authorizeTeamOwnerAccess(req: Request, teamId: string) {
  const userId = await resolveRequestActorUserId(req);
  if (!userId) {
    return { allowed: false as const, error: 'Authentication required.', status: 401 };
  }

  const teamRows = await db
    .select({ workspaceId: teams.workspaceId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const workspaceId = teamRows[0]?.workspaceId;
  if (!workspaceId) {
    return { allowed: false as const, error: 'Team not found.', status: 404 };
  }

  const role = await getWorkspaceMemberRole(workspaceId, userId);
  if (role !== 'owner') {
    return { allowed: false as const, error: 'Only workspace owners can manage teams.', status: 403 };
  }

  // Return workspaceId so callers can avoid a redundant round-trip to look it up again.
  return { allowed: true as const, userId, workspaceId };
}
