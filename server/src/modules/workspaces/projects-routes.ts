import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { cycles, domains, projectMembers, projects, workspaceMembers, workspaces, workspaceSettings } from '../../db/schema.js';
import {
  createId,
  normalizeEntityKey,
  normalizeIsoDate,
} from '../../lib/platform.js';
import {
  listProjectsWithDetails,
  createProjectRecord,
  updateProjectRecord,
  getProjectByInviteCode,
  acceptProjectInvite,
  getProjectById,
  addProjectMemberRecord,
} from './services/projects.js';
import { buildProjectKeyConflictMessage, mapProjectCreationError, projectKeyExists } from './utils/project-creation.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';

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

      const projectsList = await listProjectsWithDetails(userId, workspaceId);
      res.json(projectsList);
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

      const project = await createProjectRecord({
        name,
        description,
        key: normalizedKey,
        status,
        ownerId,
        workspaceId: targetWorkspaceId,
      });

      res.status(201).json({
        ...mapProject(project),
        inviteCode: project.inviteCode,
      });
    } catch (error) {
      const mapped = mapProjectCreationError(error, normalizeEntityKey(key));
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  router.patch('/projects/:projectId', async (req, res) => {
    try {
      const updatedProject = await updateProjectRecord(req.params.projectId, {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        status: typeof req.body?.status === 'string' ? req.body.status : undefined,
      });

      if (!updatedProject) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      res.json(mapProject(updatedProject));
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
      const project = await getProjectByInviteCode(inviteCode);
      if (!project) {
        res.status(404).json({ error: 'Project invite not found.' });
        return;
      }

      await acceptProjectInvite(project.id, project.workspaceId, userId);

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
      const project = await getProjectById(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      await addProjectMemberRecord(project.id, project.workspaceId, userId, typeof role === 'string' ? role : 'developer');

      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add project member.' });
    }
  });

  return router;
}