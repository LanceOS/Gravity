import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { userSettings } from '../db/schema.js';
import { broadcastEvent } from '../realtime.js';
import { ensureUserDefaults, getUserById, listUsers } from '../lib/platform.js';

export function createUsersRouter() {
  const router = Router();

  router.get('/users', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const users = await listUsers(projectId);
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