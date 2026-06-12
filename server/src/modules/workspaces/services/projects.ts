import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { cycles, projectMembers, projects, workspaceMembers, workspaces, workspaceSettings, teams } from '../../../db/schema.js';
import {
  addWorkspaceMembersToProject,
  createId,
  createProjectInviteCode,
  createWorkspaceAccessKey,
  ensureProjectMembership,
  ensureWorkspaceMembership,
  invalidateWorkspaceCache,
  invalidateUserWorkspacesCache,
  normalizeEntityKey,
  normalizeIsoDate,
} from '../../../lib/platform.js';
import {
  DEFAULT_TEAM_COLOR,
  DEFAULT_TEAM_DESCRIPTION,
  DEFAULT_TEAM_NAME,
  getDefaultTeamId,
} from '../utils/default-team.js';

function mapCycle(cycle: typeof cycles.$inferSelect) {
  const now = Date.now();
  const startTime = cycle.startDate.getTime();
  const endTime = cycle.endDate.getTime();

  return {
    id: cycle.id,
    name: cycle.name,
    startDate: normalizeIsoDate(cycle.startDate),
    endDate: normalizeIsoDate(cycle.endDate),
    completed: cycle.completed ? 1 : 0,
    isActive: !cycle.completed && now >= startTime && now <= endTime,
  };
}

export async function listProjectsWithDetails(userId: string, workspaceId?: string) {
  const baseQuery = db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      key: projects.key,
      status: projects.status,
      workspaceId: projects.workspaceId,
      githubRepoUrl: projects.githubRepoUrl,
      teamId: projects.teamId,
    })
    .from(projects)
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)));

  const projectRows: Array<{
    id: string;
    name: string;
    description: string;
    key: string;
    status: string;
    workspaceId: string;
    githubRepoUrl: string | null;
    teamId: string;
  }> = workspaceId
    ? await baseQuery.where(eq(projects.workspaceId, workspaceId)).orderBy(asc(projects.createdAt))
    : await baseQuery.orderBy(asc(projects.createdAt));

  const projectIds = projectRows.map((project) => project.id);

  if (projectIds.length === 0) {
    return [];
  }

  return projectRows.map((project) => ({
    ...project,
    domains: [],
    cycles: [],
  }));
}

export async function createProjectRecord(params: {
  name: string;
  description?: string;
  key: string;
  status?: string;
  ownerId: string;
  workspaceId?: string;
  teamId?: string;
}) {
  const projectId = createId('p');
  const normalizedKey = normalizeEntityKey(params.key);
  let targetWorkspaceId = params.workspaceId;

  await db.transaction(async (tx) => {
    if (!targetWorkspaceId) {
      targetWorkspaceId = createId('w');
      await tx.insert(workspaces).values({
        id: targetWorkspaceId,
        name: params.name,
        description: params.description ?? '',
        key: normalizedKey,
        workspaceKey: createWorkspaceAccessKey(normalizedKey),
        defaultProjectId: projectId,
        hostUrl: '',
        createdBy: params.ownerId,
        createdAt: new Date(),
      });
      await tx.insert(workspaceSettings).values({
        workspaceId: targetWorkspaceId,
        hostUrl: '',
        joinMode: 'approval_required',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await tx.insert(workspaceMembers).values({
        workspaceId: targetWorkspaceId,
        userId: params.ownerId,
        role: 'owner',
        createdAt: new Date(),
      });
      await tx.insert(teams).values({
        id: getDefaultTeamId(targetWorkspaceId),
        workspaceId: targetWorkspaceId,
        name: DEFAULT_TEAM_NAME,
        description: DEFAULT_TEAM_DESCRIPTION,
        color: DEFAULT_TEAM_COLOR,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      const settingsRows = await tx
        .select({ hierarchyMode: workspaceSettings.hierarchyMode })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, targetWorkspaceId))
        .limit(1);

      const hierarchyMode = settingsRows[0]?.hierarchyMode === 'teams' ? 'teams' : 'flat';
      const teamRows = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.workspaceId, targetWorkspaceId))
        .orderBy(asc(teams.createdAt));

      let resolvedTeamId = params.teamId;
      if (!resolvedTeamId) {
        if (hierarchyMode === 'teams') {
          if (teamRows.length === 1) {
            resolvedTeamId = teamRows[0].id;
          } else {
            throw new Error('Team workspaces require a team before creating projects.');
          }
        } else if (teamRows.length === 0) {
          resolvedTeamId = getDefaultTeamId(targetWorkspaceId);
          await tx.insert(teams).values({
            id: resolvedTeamId,
            workspaceId: targetWorkspaceId,
            name: DEFAULT_TEAM_NAME,
            description: DEFAULT_TEAM_DESCRIPTION,
            color: DEFAULT_TEAM_COLOR,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } else {
          resolvedTeamId = teamRows[0].id;
        }
      }

      if (!resolvedTeamId) {
        throw new Error('A team is required to create a project.');
      }

      await tx.insert(projects).values({
        id: projectId,
        workspaceId: targetWorkspaceId,
        teamId: resolvedTeamId,
        name: params.name,
        description: params.description ?? '',
        key: normalizedKey,
        status: params.status ?? 'active',
        inviteCode: createProjectInviteCode(normalizedKey),
        createdBy: params.ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx
        .update(workspaces)
        .set({ defaultProjectId: projectId })
        .where(and(eq(workspaces.id, targetWorkspaceId), isNull(workspaces.defaultProjectId)));

      await ensureWorkspaceMembership(targetWorkspaceId, params.ownerId, 'owner', undefined, tx);
      await ensureProjectMembership(projectId, params.ownerId, 'owner', undefined, tx);
      await addWorkspaceMembersToProject(targetWorkspaceId, projectId, tx);
      return;
    }

    await tx.insert(projects).values({
      id: projectId,
      workspaceId: targetWorkspaceId,
      teamId: params.teamId || getDefaultTeamId(targetWorkspaceId),
      name: params.name,
      description: params.description ?? '',
      key: normalizedKey,
      status: params.status ?? 'active',
      inviteCode: createProjectInviteCode(normalizedKey),
      createdBy: params.ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await tx
      .update(workspaces)
      .set({ defaultProjectId: projectId })
      .where(and(eq(workspaces.id, targetWorkspaceId), isNull(workspaces.defaultProjectId)));

    await ensureWorkspaceMembership(targetWorkspaceId, params.ownerId, 'owner', undefined, tx);
    await ensureProjectMembership(projectId, params.ownerId, 'owner', undefined, tx);
    await addWorkspaceMembersToProject(targetWorkspaceId, projectId, tx);
  });

  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (project) {
    await invalidateWorkspaceCache(project.workspaceId);
  }
  return project;
}

export async function updateProjectRecord(projectId: string, params: { name?: string; description?: string; status?: string; githubRepoUrl?: string | null; teamId?: string }) {
  const rows = await db
    .update(projects)
    .set({
      ...(typeof params.name === 'string' ? { name: params.name } : {}),
      ...(typeof params.description === 'string' ? { description: params.description } : {}),
      ...(typeof params.status === 'string' ? { status: params.status } : {}),
      ...(typeof params.githubRepoUrl === 'string' || params.githubRepoUrl === null ? { githubRepoUrl: params.githubRepoUrl } : {}),
      ...(typeof params.teamId === 'string' ? { teamId: params.teamId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  return rows[0] ?? null;
}

export async function getProjectByInviteCode(inviteCode: string) {
  const rows = await db.select().from(projects).where(eq(projects.inviteCode, inviteCode)).limit(1);
  return rows[0] ?? null;
}

export async function getProjectById(projectId: string) {
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return rows[0] ?? null;
}

export async function acceptProjectInvite(projectId: string, workspaceId: string, userId: string) {
  await db.transaction(async (tx) => {
    await ensureWorkspaceMembership(workspaceId, userId, 'member', undefined, tx);
    await ensureProjectMembership(projectId, userId, 'developer', undefined, tx);
  });

  await invalidateWorkspaceCache(workspaceId);
  await invalidateUserWorkspacesCache(userId);
}

export async function addProjectMemberRecord(projectId: string, workspaceId: string, userId: string, role: string) {
  await db.transaction(async (tx) => {
    await ensureWorkspaceMembership(workspaceId, userId, 'member', undefined, tx);
    await ensureProjectMembership(projectId, userId, role, undefined, tx);
  });

  await invalidateWorkspaceCache(workspaceId);
  await invalidateUserWorkspacesCache(userId);
}
