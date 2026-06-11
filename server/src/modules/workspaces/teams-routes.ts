import { Router } from 'express';
import { db } from '../../db/index.js';
import { teams, projects } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createId } from '../../lib/platform.js';
import { authorizeWorkspaceAccess, authorizeTeamAccess } from './services/membership.js';

export function createTeamsRouter() {
  const router = Router();

  // Create team
  router.post('/teams', async (req, res) => {
    const { workspaceId, name, description, color } = req.body ?? {};
    if (!workspaceId || !name) {
      res.status(400).json({ error: 'workspaceId and name are required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const teamId = createId('t');
      await db.insert(teams).values({
        id: teamId,
        workspaceId,
        name,
        description: description ?? '',
        color: color ?? '#6B7280',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const newTeam = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      res.status(201).json(newTeam[0]);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create team.' });
    }
  });

  // Get teams list
  router.get('/teams', async (req, res) => {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId is required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const list = await db.select().from(teams).where(eq(teams.workspaceId, workspaceId));
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list teams.' });
    }
  });

  // Update team
  router.patch('/teams/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const { name, description, color } = req.body ?? {};

    try {
      const auth = await authorizeTeamAccess(req, teamId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const updates: any = {};
      if (typeof name === 'string') updates.name = name;
      if (typeof description === 'string') updates.description = description;
      if (typeof color === 'string') updates.color = color;
      updates.updatedAt = new Date();

      await db.update(teams).set(updates).where(eq(teams.id, teamId));
      const updated = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      res.json(updated[0]);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update team.' });
    }
  });

  // Delete team
  router.delete('/teams/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const reassignTeamId = typeof req.query.reassignTeamId === 'string' ? req.query.reassignTeamId : undefined;

    try {
      const auth = await authorizeTeamAccess(req, teamId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Check if there are projects referencing this team
      const existingProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.teamId, teamId));

      if (existingProjects.length > 0) {
        if (reassignTeamId) {
          // Verify reassignTeamId exists and belongs to same workspace
          const targetTeamRows = await db.select().from(teams).where(eq(teams.id, reassignTeamId)).limit(1);
          if (targetTeamRows.length === 0) {
            res.status(400).json({ error: 'Reassignment target team not found.' });
            return;
          }
          const currentTeamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
          if (targetTeamRows[0].workspaceId !== currentTeamRows[0]?.workspaceId) {
            res.status(400).json({ error: 'Reassignment target team must belong to the same workspace.' });
            return;
          }

          // Reassign projects
          await db
            .update(projects)
            .set({ teamId: reassignTeamId })
            .where(eq(projects.teamId, teamId));
        } else {
          res.status(400).json({ error: 'Cannot delete team: projects exist. Please reassign them first.' });
          return;
        }
      }

      await db.delete(teams).where(eq(teams.id, teamId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete team.' });
    }
  });

  return router;
}
