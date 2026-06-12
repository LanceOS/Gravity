import { Router } from 'express';
import { db } from '../../db/index.js';
import { comments, cycles, domains, labels, noteMetadata, projectMembers, projects, teams, ticketLabels, tickets, workspaces } from '../../db/schema.js';
import { eq, inArray, or } from 'drizzle-orm';
import { createId, invalidateWorkspaceCache } from '../../lib/platform.js';
import { RustFS } from '../../lib/rustfs.js';
import {
  authorizeWorkspaceAccess,
  authorizeWorkspaceOwnerAccess,
  authorizeTeamAccess,
  authorizeTeamOwnerAccess,
} from './services/membership.js';

async function deleteLastTeamWithOwnedWork(teamId: string, workspaceId: string) {
  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.teamId, teamId));

  const projectIds = projectRows.map((row) => row.id);

  let ticketRows: Array<{ id: string }> = [];
  let labelRows: Array<{ id: string }> = [];
  let noteRows: Array<{ bucketPath: string }> = [];

  if (projectIds.length > 0) {
    [ticketRows, labelRows, noteRows] = await Promise.all([
      db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.projectId, projectIds)),
      db.select({ id: labels.id }).from(labels).where(inArray(labels.projectId, projectIds)),
      db.select({ bucketPath: noteMetadata.bucketPath }).from(noteMetadata).where(inArray(noteMetadata.projectId, projectIds)),
    ]);
  }

  const ticketIds = ticketRows.map((row) => row.id);
  const labelIds = labelRows.map((row) => row.id);
  const noteBucketPaths = [...new Set(noteRows.map((row) => row.bucketPath))];

  await db.transaction(async (tx) => {
    if (ticketIds.length > 0) {
      await tx.delete(ticketLabels).where(inArray(ticketLabels.ticketId, ticketIds));
      await tx.delete(comments).where(inArray(comments.ticketId, ticketIds));
      await tx.delete(tickets).where(inArray(tickets.id, ticketIds));
    }

    if (labelIds.length > 0) {
      await tx.delete(ticketLabels).where(inArray(ticketLabels.labelId, labelIds));
      await tx.delete(labels).where(inArray(labels.id, labelIds));
    }

    if (projectIds.length > 0) {
      await tx.delete(noteMetadata).where(inArray(noteMetadata.projectId, projectIds));
      await tx.delete(projectMembers).where(inArray(projectMembers.projectId, projectIds));
      // Combine both project-scoped and team-scoped deletions into one query each.
      await tx.delete(cycles).where(or(inArray(cycles.projectId, projectIds), eq(cycles.teamId, teamId)));
      await tx.delete(domains).where(or(inArray(domains.projectId, projectIds), eq(domains.teamId, teamId)));
      await tx.delete(projects).where(inArray(projects.id, projectIds));
    } else {
      await tx.delete(cycles).where(eq(cycles.teamId, teamId));
      await tx.delete(domains).where(eq(domains.teamId, teamId));
    }

    await tx.update(workspaces).set({ defaultProjectId: null }).where(eq(workspaces.id, workspaceId));
    await tx.delete(teams).where(eq(teams.id, teamId));
  });

  const cleanupResults = await Promise.allSettled(noteBucketPaths.map((bucketPath) => RustFS.deleteBucket(bucketPath)));
  for (const result of cleanupResults) {
    if (result.status === 'rejected') {
      // Best-effort cleanup keeps the database consistent even if object storage lags behind.
      // eslint-disable-next-line no-console
      console.error('Failed to delete note bucket during team deletion:', result.reason);
    }
  }

  await invalidateWorkspaceCache(workspaceId);
}

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
      const auth = await authorizeWorkspaceOwnerAccess(req, workspaceId);
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

  // Get team details
  router.get('/teams/:teamId', async (req, res) => {
    const { teamId } = req.params;

    try {
      const auth = await authorizeTeamAccess(req, teamId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const teamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (teamRows.length === 0) {
        res.status(404).json({ error: 'Team not found.' });
        return;
      }

      res.json(teamRows[0]);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load team.' });
    }
  });

  // Update team
  router.patch('/teams/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const { name, description, color } = req.body ?? {};

    try {
      const auth = await authorizeTeamOwnerAccess(req, teamId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const updates: Partial<typeof teams.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
      if (typeof name === 'string') updates.name = name;
      if (typeof description === 'string') updates.description = description;
      if (typeof color === 'string') updates.color = color;

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
      const auth = await authorizeTeamOwnerAccess(req, teamId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // auth already validated the team exists and returns its workspaceId — no need for a second lookup.
      const { workspaceId } = auth;

      const workspaceTeamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.workspaceId, workspaceId));

      const [existingProjects, existingCycles, existingDomains] = await Promise.all([
        db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, teamId)),
        db.select({ id: cycles.id }).from(cycles).where(eq(cycles.teamId, teamId)),
        db.select({ id: domains.id }).from(domains).where(eq(domains.teamId, teamId)),
      ]);
      const isLastTeam = workspaceTeamRows.length <= 1;

      if (existingProjects.length > 0 || existingCycles.length > 0 || existingDomains.length > 0) {
        if (reassignTeamId) {
          if (reassignTeamId === teamId) {
            res.status(400).json({ error: 'Reassignment target team must be different from the current team.' });
            return;
          }

          const targetTeamRows = await db.select().from(teams).where(eq(teams.id, reassignTeamId)).limit(1);
          if (targetTeamRows.length === 0) {
            res.status(400).json({ error: 'Reassignment target team not found.' });
            return;
          }
          if (targetTeamRows[0].workspaceId !== workspaceId) {
            res.status(400).json({ error: 'Reassignment target team must belong to the same workspace.' });
            return;
          }

          await db.transaction(async (tx) => {
            await tx.update(projects).set({ teamId: reassignTeamId }).where(eq(projects.teamId, teamId));
            await tx.update(cycles).set({ teamId: reassignTeamId }).where(eq(cycles.teamId, teamId));
            await tx.update(domains).set({ teamId: reassignTeamId }).where(eq(domains.teamId, teamId));
            await tx.delete(teams).where(eq(teams.id, teamId));
          });
          await invalidateWorkspaceCache(workspaceId);
        } else if (isLastTeam) {
          await deleteLastTeamWithOwnedWork(teamId, workspaceId);
        } else {
          res.status(400).json({ error: 'Cannot delete team: projects, cycles, or domains still reference it. Please reassign them first.' });
          return;
        }
      } else {
        await db.delete(teams).where(eq(teams.id, teamId));
        await invalidateWorkspaceCache(workspaceId);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete team.' });
    }
  });

  return router;
}
