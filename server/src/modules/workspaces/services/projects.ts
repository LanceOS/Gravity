import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { cycles, domains, projectMembers, projects, workspaceMembers, workspaces, workspaceSettings } from '../../../db/schema.js';
import {
  addWorkspaceMembersToProject,
  createId,
  createProjectInviteCode,
  createWorkspaceAccessKey,
  ensureProjectMembership,
  ensureWorkspaceMembership,
  normalizeEntityKey,
  normalizeIsoDate,
} from '../../../lib/platform.js';

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
  }> = workspaceId
    ? await baseQuery.where(eq(projects.workspaceId, workspaceId)).orderBy(asc(projects.createdAt))
    : await baseQuery.orderBy(asc(projects.createdAt));

  const projectIds = projectRows.map((project) => project.id);

  if (projectIds.length === 0) {
    return [];
  }

  const [domainRows, cycleRows] = await Promise.all([
    db.select().from(domains).where(inArray(domains.projectId, projectIds)).orderBy(asc(domains.createdAt)),
    db.select().from(cycles).where(inArray(cycles.projectId, projectIds)).orderBy(asc(cycles.startDate)),
  ]);

  const domainsByProject = new Map<string, Array<{ id: string; name: string; color: string }>>();
  for (const domain of domainRows) {
    const nextDomains = domainsByProject.get(domain.projectId) ?? [];
    nextDomains.push({ id: domain.id, name: domain.name, color: domain.color });
    domainsByProject.set(domain.projectId, nextDomains);
  }

  const cyclesByProject = new Map<string, Array<ReturnType<typeof mapCycle>>>();
  for (const cycle of cycleRows) {
    const nextCycles = cyclesByProject.get(cycle.projectId) ?? [];
    nextCycles.push(mapCycle(cycle));
    cyclesByProject.set(cycle.projectId, nextCycles);
  }

  return projectRows.map((project) => ({
    ...project,
    domains: domainsByProject.get(project.id) ?? [],
    cycles: cyclesByProject.get(project.id) ?? [],
  }));
}

export async function createProjectRecord(params: {
  name: string;
  description?: string;
  key: string;
  status?: string;
  ownerId: string;
  workspaceId?: string;
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
    }

    await tx.insert(projects).values({
      id: projectId,
      workspaceId: targetWorkspaceId,
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
  return rows[0];
}

export async function updateProjectRecord(projectId: string, params: { name?: string; description?: string; status?: string }) {
  const rows = await db
    .update(projects)
    .set({
      ...(typeof params.name === 'string' ? { name: params.name } : {}),
      ...(typeof params.description === 'string' ? { description: params.description } : {}),
      ...(typeof params.status === 'string' ? { status: params.status } : {}),
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
}

export async function addProjectMemberRecord(projectId: string, workspaceId: string, userId: string, role: string) {
  await db.transaction(async (tx) => {
    await ensureWorkspaceMembership(workspaceId, userId, 'member', undefined, tx);
    await ensureProjectMembership(projectId, userId, role, undefined, tx);
  });
}
