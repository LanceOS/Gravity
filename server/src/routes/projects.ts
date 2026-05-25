import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { cycles, domains, projectMembers, projects, workspaceMembers, workspaces, workspaceSettings } from '../db/schema.js';
import {
  addWorkspaceMembersToProject,
  createId,
  createProjectInviteCode,
  createWorkspaceAccessKey,
  ensureProjectMembership,
  ensureWorkspaceMembership,
  normalizeEntityKey,
  normalizeIsoDate,
} from '../lib/platform.js';
import { buildProjectKeyConflictMessage, mapProjectCreationError, projectKeyExists } from '../lib/project-creation.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';

function mapProject(project: typeof projects.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    key: project.key,
    status: project.status,
    workspaceId: project.workspaceId,
  };
}

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

export function createProjectsRouter() {
  const router = Router();

  router.get('/projects', async (req, res) => {
    try {
      const actorUserId = await resolveRequestActorUserId(req);
      if (!actorUserId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      if (requestedUserId && requestedUserId !== actorUserId) {
        res.status(403).json({ error: 'Forbidden.' });
        return;
      }

      const userId = actorUserId;
      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

      let projectRows: Array<{
        id: string;
        name: string;
        description: string;
        key: string;
        status: string;
        workspaceId: string;
      }>;

      if (userId && workspaceId) {
        projectRows = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            key: projects.key,
            status: projects.status,
            workspaceId: projects.workspaceId,
          })
          .from(projects)
          .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
          .where(eq(projects.workspaceId, workspaceId))
          .orderBy(asc(projects.createdAt));
      } else if (userId) {
        projectRows = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            key: projects.key,
            status: projects.status,
            workspaceId: projects.workspaceId,
          })
          .from(projects)
          .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
          .orderBy(asc(projects.createdAt));
      } else if (workspaceId) {
        projectRows = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            key: projects.key,
            status: projects.status,
            workspaceId: projects.workspaceId,
          })
          .from(projects)
          .where(eq(projects.workspaceId, workspaceId))
          .orderBy(asc(projects.createdAt));
      } else {
        projectRows = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            key: projects.key,
            status: projects.status,
            workspaceId: projects.workspaceId,
          })
          .from(projects)
          .orderBy(asc(projects.createdAt));
      }

      const projectIds = projectRows.map((project) => project.id);

      if (projectIds.length === 0) {
        res.json([]);
        return;
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

      res.json(
        projectRows.map((project) => ({
          ...project,
          domains: domainsByProject.get(project.id) ?? [],
          cycles: cyclesByProject.get(project.id) ?? [],
        })),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load projects.' });
    }
  });

  router.post('/projects', async (req, res) => {
    const { name, description, key, status, ownerId, workspaceId } = req.body ?? {};
    if (!name || !key || !ownerId) {
      res.status(400).json({ error: 'Project name, key, and ownerId are required.' });
      return;
    }

    try {
      const projectId = createId('p');
      const normalizedKey = normalizeEntityKey(key);
      if (await projectKeyExists(normalizedKey)) {
        res.status(409).json({ error: buildProjectKeyConflictMessage(normalizedKey) });
        return;
      }

      let targetWorkspaceId = workspaceId as string | undefined;

      await db.transaction(async (tx) => {
        if (!targetWorkspaceId) {
          targetWorkspaceId = createId('w');
          await tx.insert(workspaces).values({
            id: targetWorkspaceId,
            name,
            description: description ?? '',
            key: normalizedKey,
            workspaceKey: createWorkspaceAccessKey(normalizedKey),
            defaultProjectId: projectId,
            hostUrl: '',
            createdBy: ownerId,
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
            userId: ownerId,
            role: 'owner',
            createdAt: new Date(),
          });
        }

        await tx.insert(projects).values({
          id: projectId,
          workspaceId: targetWorkspaceId!,
          name,
          description: description ?? '',
          key: normalizedKey,
          status: status ?? 'active',
          inviteCode: createProjectInviteCode(normalizedKey),
          createdBy: ownerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx
          .update(workspaces)
          .set({ defaultProjectId: projectId })
          .where(and(eq(workspaces.id, targetWorkspaceId!), isNull(workspaces.defaultProjectId)));
      });

      await ensureWorkspaceMembership(targetWorkspaceId!, ownerId, 'owner');
      await ensureProjectMembership(projectId, ownerId, 'owner');
      await addWorkspaceMembersToProject(targetWorkspaceId!, projectId);

      const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      res.status(201).json({
        ...mapProject(rows[0]),
        inviteCode: rows[0].inviteCode,
      });
    } catch (error) {
      const mapped = mapProjectCreationError(error, normalizeEntityKey(key));
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  router.patch('/projects/:projectId', async (req, res) => {
    try {
      const rows = await db
        .update(projects)
        .set({
          ...(typeof req.body?.name === 'string' ? { name: req.body.name } : {}),
          ...(typeof req.body?.description === 'string' ? { description: req.body.description } : {}),
          ...(typeof req.body?.status === 'string' ? { status: req.body.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, req.params.projectId))
        .returning();

      if (!rows[0]) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      res.json(mapProject(rows[0]));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update project.' });
    }
  });

  router.post('/projects/invite/accept', async (req, res) => {
    const { inviteCode, userId } = req.body ?? {};
    if (!inviteCode || !userId) {
      res.status(400).json({ error: 'inviteCode and userId are required.' });
      return;
    }

    try {
      const rows = await db.select().from(projects).where(eq(projects.inviteCode, inviteCode)).limit(1);
      const project = rows[0];
      if (!project) {
        res.status(404).json({ error: 'Project invite not found.' });
        return;
      }

      await ensureWorkspaceMembership(project.workspaceId, userId, 'member');
      await ensureProjectMembership(project.id, userId, 'developer');
      res.json({ project: mapProject(project) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to accept invite.' });
    }
  });

  router.post('/projects/:projectId/members', async (req, res) => {
    const { userId, role } = req.body ?? {};
    if (!userId) {
      res.status(400).json({ error: 'userId is required.' });
      return;
    }

    try {
      const rows = await db.select().from(projects).where(eq(projects.id, req.params.projectId)).limit(1);
      const project = rows[0];
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      await ensureWorkspaceMembership(project.workspaceId, userId, 'member');
      await ensureProjectMembership(project.id, userId, typeof role === 'string' ? role : 'developer');
      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add project member.' });
    }
  });

  return router;
}