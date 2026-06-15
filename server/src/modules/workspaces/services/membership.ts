import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { workspaceMembers, projects, projectMembers, teams } from '../schema.js';
import type { Request } from 'express';
import * as cache from '../../../lib/cache.js';
import { resolveRequestActorUserId } from '../../auth/utils/request-auth.js';

const WORKSPACE_MEMBERSHIP_TTL_SECONDS = 45;
const PROJECT_WORKSPACE_TTL_SECONDS = 120;
const PROJECT_MEMBERSHIP_TTL_SECONDS = 45;
const TEAM_WORKSPACE_TTL_SECONDS = 120;

function uniqueStringArray(values: string[]) {
  return [...new Set(values)];
}

async function getWorkspaceMemberRoleCached(workspaceId: string, userId: string): Promise<string | null> {
  const rolePromiseKey = cache.CacheKeys.memberships.workspaceRole(workspaceId, userId);
  return cache.wrap(rolePromiseKey, WORKSPACE_MEMBERSHIP_TTL_SECONDS, async () => {
    const membershipRows = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    return membershipRows[0]?.role ?? null;
  });
}

async function getProjectWorkspaceIdCached(projectId: string): Promise<string | null> {
  return cache.wrap(cache.CacheKeys.memberships.projectWorkspace(projectId), PROJECT_WORKSPACE_TTL_SECONDS, async () => {
    const projectRows = await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    return projectRows[0]?.workspaceId ?? null;
  });
}

async function getTeamWorkspaceIdCached(teamId: string): Promise<string | null> {
  return cache.wrap(cache.CacheKeys.memberships.teamWorkspace(teamId), TEAM_WORKSPACE_TTL_SECONDS, async () => {
    const teamRows = await db
      .select({ workspaceId: teams.workspaceId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    return teamRows[0]?.workspaceId ?? null;
  });
}

/**
 * Checks if a user is a member of a specific workspace.
 */
export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const memberPromiseKey = cache.CacheKeys.memberships.workspaceMember(workspaceId, userId);
  return cache.wrap(memberPromiseKey, WORKSPACE_MEMBERSHIP_TTL_SECONDS, async () => {
    const membershipRows = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);

    return membershipRows.length > 0;
  });
}

export async function getWorkspaceMemberRole(workspaceId: string, userId: string): Promise<string | null> {
  return getWorkspaceMemberRoleCached(workspaceId, userId);
}

async function getProjectMemberRoleCached(projectId: string, userId: string): Promise<string | null> {
  return cache.wrap(cache.CacheKeys.memberships.projectMember(projectId, userId), PROJECT_MEMBERSHIP_TTL_SECONDS, async () => {
    const membershipRows = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);

    return membershipRows[0]?.role ?? null;
  });
}

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  const role = await getProjectMemberRoleCached(projectId, userId);
  return role !== null;
}

export async function getProjectMemberRole(projectId: string, userId: string): Promise<string | null> {
  return getProjectMemberRoleCached(projectId, userId);
}

export async function invalidateProjectMembershipCaches(projectId: string, userIds: string[]): Promise<void> {
  const uniqueUserIds = uniqueStringArray(userIds);
  if (uniqueUserIds.length === 0) {
    return;
  }

  await cache.delMany(uniqueUserIds.map((userId) => cache.CacheKeys.memberships.projectMember(projectId, userId)));
}

/**
 * Gets the workspace ID associated with a project, if the project exists.
 */
export async function getProjectWorkspaceId(projectId: string): Promise<string | null> {
  return getProjectWorkspaceIdCached(projectId);
}

export async function invalidateWorkspaceMembershipCaches(workspaceId: string, userIds: string[]): Promise<void> {
  const uniqueUserIds = uniqueStringArray(userIds);
  if (uniqueUserIds.length === 0) {
    return;
  }

  await cache.delMany(
    uniqueUserIds.flatMap((userId) => [
      cache.CacheKeys.memberships.workspaceRole(workspaceId, userId),
      cache.CacheKeys.memberships.workspaceMember(workspaceId, userId),
    ]),
  );
}

export async function invalidateWorkspaceMembershipCache(workspaceId: string, userId?: string): Promise<void> {
  if (userId) {
    await invalidateWorkspaceMembershipCaches(workspaceId, [userId]);
    return;
  }

  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  if (rows.length === 0) {
    return;
  }

  await invalidateWorkspaceMembershipCaches(
    workspaceId,
    rows.map((membership) => membership.userId),
  );
}

export async function invalidateProjectWorkspaceCache(projectId: string): Promise<void> {
  await cache.del(cache.CacheKeys.memberships.projectWorkspace(projectId));
}

export async function invalidateProjectMembershipCache(projectId: string, userId?: string): Promise<void> {
  if (userId) {
    await invalidateProjectMembershipCaches(projectId, [userId]);
    return;
  }

  const rows = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, projectId));

  if (rows.length === 0) {
    return;
  }

  await invalidateProjectMembershipCaches(projectId, rows.map((member) => member.userId));
}

export async function invalidateTeamWorkspaceCache(teamId: string): Promise<void> {
  await cache.del(cache.CacheKeys.memberships.teamWorkspace(teamId));
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

export async function authorizeProjectMemberAccess(req: Request, projectId: string) {
  const userId = await resolveRequestActorUserId(req);
  if (!userId) {
    return { allowed: false as const, error: 'Authentication required.', status: 401 };
  }

  const workspaceId = await getProjectWorkspaceId(projectId);
  if (!workspaceId) {
    return { allowed: false as const, error: 'Project not found.', status: 404 };
  }

  const projectRole = await getProjectMemberRole(projectId, userId);
  if (!projectRole) {
    return { allowed: false as const, error: 'Access denied: not a member of the project.', status: 403 };
  }

  return { allowed: true as const, userId, workspaceId, projectId, projectRole };
}

export async function authorizeProjectOwnerOrWorkspaceAdminAccess(req: Request, projectId: string) {
  const auth = await authorizeProjectMemberAccess(req, projectId);
  if (!auth.allowed) {
    return auth;
  }

  const workspaceRole = await getWorkspaceMemberRole(auth.workspaceId, auth.userId);
  if (auth.projectRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'owner') {
    return auth;
  }

  return { allowed: false as const, error: 'Only a project owner or workspace admin can manage this project.', status: 403 };
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

export async function authorizeWorkspaceOwnerOrAdminAccess(req: Request, workspaceId: string) {
  const auth = await authorizeWorkspaceAccess(req, workspaceId);
  if (!auth.allowed) {
    return auth;
  }

  const role = await getWorkspaceMemberRole(workspaceId, auth.userId);
  if (role !== 'owner' && role !== 'admin') {
    return { allowed: false as const, error: 'Only workspace owners or admins can perform this action.', status: 403 };
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
  const workspaceId = await getTeamWorkspaceIdCached(teamId);
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

  const workspaceId = await getTeamWorkspaceIdCached(teamId);
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
