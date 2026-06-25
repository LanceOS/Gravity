import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { userSettings, authUsers } from '../../db/schema.js';
import { broadcastEvent } from '../../realtime.js';
import { ensureUserDefaults, getUserById, listUsers } from '../../lib/platform.js';
import { audit } from '../../lib/logger.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { authorizeProjectAccess, authorizeTeamAccess, authorizeWorkspaceAccess } from '../workspaces/services/membership.js';

export function createUsersRouter() {
  const router = Router();

  router.get('/users', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;

      const actorUserId = await resolveRequestActorUserId(req);

      if (projectId) {
        const auth = await authorizeProjectAccess(req, projectId);
        if (!auth.allowed) {
          audit('users.list.scope_rejected', {
            action: 'list_users',
            actorUserId,
            requestedScope: { projectId },
            status: auth.status,
            error: auth.error,
            route: 'GET /users',
          });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
      } else if (teamId) {
        const auth = await authorizeTeamAccess(req, teamId);
        if (!auth.allowed) {
          audit('users.list.scope_rejected', {
            action: 'list_users',
            actorUserId,
            requestedScope: { teamId },
            status: auth.status,
            error: auth.error,
            route: 'GET /users',
          });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
      } else if (workspaceId) {
        const auth = await authorizeWorkspaceAccess(req, workspaceId);
        if (!auth.allowed) {
          audit('users.list.scope_rejected', {
            action: 'list_users',
            actorUserId,
            requestedScope: { workspaceId },
            status: auth.status,
            error: auth.error,
            route: 'GET /users',
          });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
      } else {
        audit('users.list.scope_missing', {
          action: 'list_users',
          actorUserId,
          route: 'GET /users',
        });
        res.status(400).json({ error: 'workspaceId, projectId, or teamId is required to list users.' });
        return;
      }

      const users = await listUsers(projectId
        ? { projectId }
        : teamId
          ? { teamId }
          : { workspaceId }
      );
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load users.' });
    }
  });

  router.patch('/users/:userId/tutorial', async (req, res) => {
    const { userId } = req.params;
    const completed = Boolean(req.body?.completed);

    try {
      await ensureUserDefaults(userId);
      await db
        .update(userSettings)
        .set({ tutorialCompleted: completed, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId));

      await db
        .update(authUsers)
        .set({ tutorial_completed: completed, updatedAt: new Date() })
        .where(eq(authUsers.id, userId));

      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      broadcastEvent('users-updated', { userId });
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update tutorial state.' });
    }
  });

  return router;
}
