import { and, asc, eq } from 'drizzle-orm';
import { type Response, Router } from 'express';
import { db } from '../db/index.js';
import { cycles, domains, projects, tickets } from '../db/schema.js';
import { broadcastEvent } from '../realtime.js';
import { createId, getProjectIdFromRequest, normalizeIsoDate } from '../lib/platform.js';
import { getWorkspaceAccess, optionalWorkspaceAccess, type WorkspaceAccessLocals } from '../lib/workspace-access.js';
import {
  addCommentRecord,
  createTicketRecord,
  getTicketById,
  deleteTicketRecord,
  getTicketDetails,
  listComments,
  listTickets,
  updateTicketRecord,
} from '../services/tickets.js';

function mapCycle(cycle: typeof cycles.$inferSelect) {
  return {
    id: cycle.id,
    name: cycle.name,
    startDate: normalizeIsoDate(cycle.startDate),
    endDate: normalizeIsoDate(cycle.endDate),
    completed: cycle.completed ? 1 : 0,
  };
}

export function createTicketsRouter() {
  const router = Router();

  async function ensureWorkspaceCanAccessTicket(ticketId: string, workspaceId: string) {
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return { allowed: false as const, reason: 'not_found' as const };
    }

    const projectRows = await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, ticket.projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project || project.workspaceId !== workspaceId) {
      return { allowed: false as const, reason: 'forbidden' as const };
    }

    return { allowed: true as const, ticket };
  }

  router.get('/tickets', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    try {
      const ticketList = await listTickets(projectId, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
        domainId: typeof req.query.domainId === 'string' ? req.query.domainId : undefined,
        assigneeId: typeof req.query.assigneeId === 'string' ? req.query.assigneeId : undefined,
        cycleId: typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined,
      });
      res.json(ticketList);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load tickets.' });
    }
  });

  router.post('/tickets', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId || !req.body?.title) {
      res.status(400).json({ error: 'Project ID and ticket title are required.' });
      return;
    }

    try {
      const created = await createTicketRecord({
        title: req.body.title,
        description: req.body.description,
        status: req.body.status,
        priority: req.body.priority,
        projectId,
        domainId: req.body.domainId,
        cycleId: req.body.cycleId,
        assigneeId: req.body.assigneeId,
        parentId: req.body.parentId,
      });

      broadcastEvent('tickets-updated', { projectId, tickets: await listTickets(projectId) });
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create ticket.' });
    }
  });

  router.get('/tickets/:ticketId', async (req, res) => {
    try {
      const ticket = await getTicketDetails(req.params.ticketId, getProjectIdFromRequest(req) || undefined);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      res.json(ticket);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load ticket.' });
    }
  });

  router.patch('/tickets/:ticketId', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    try {
      const updated = await updateTicketRecord(req.params.ticketId, req.body ?? {}, projectId);
      if (!updated) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      broadcastEvent('tickets-updated', { projectId, tickets: await listTickets(projectId) });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update ticket.' });
    }
  });

  router.delete('/tickets/:ticketId', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    try {
      const deleted = await deleteTicketRecord(req.params.ticketId, projectId);
      if (!deleted) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      broadcastEvent('tickets-updated', { projectId, tickets: await listTickets(projectId) });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete ticket.' });
    }
  });

  router.get('/tickets/:ticketId/comments', optionalWorkspaceAccess, async (req, res: Response<unknown, WorkspaceAccessLocals>) => {
    try {
      const workspaceAccess = getWorkspaceAccess(res);
      if (workspaceAccess) {
        const accessResult = await ensureWorkspaceCanAccessTicket(req.params.ticketId, workspaceAccess.workspaceId);
        if (!accessResult.allowed) {
          res.status(accessResult.reason === 'not_found' ? 404 : 403).json({
            error: accessResult.reason === 'not_found' ? 'Ticket not found.' : 'Workspace access does not permit this ticket.',
          });
          return;
        }
      }

      res.json(await listComments(req.params.ticketId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load comments.' });
    }
  });

  router.post('/tickets/:ticketId/comments', optionalWorkspaceAccess, async (req, res: Response<unknown, WorkspaceAccessLocals>) => {
    const workspaceAccess = getWorkspaceAccess(res);
    const userId = workspaceAccess?.userId ?? (typeof req.body?.userId === 'string' ? req.body.userId : '');
    const body =
      typeof req.body?.content === 'string'
        ? req.body.content
        : typeof req.body?.body === 'string'
          ? req.body.body
          : '';

    if (!userId || !body) {
      res.status(400).json({ error: 'userId and body are required.' });
      return;
    }

    try {
      if (workspaceAccess) {
        const accessResult = await ensureWorkspaceCanAccessTicket(req.params.ticketId, workspaceAccess.workspaceId);
        if (!accessResult.allowed) {
          res.status(accessResult.reason === 'not_found' ? 404 : 403).json({
            error: accessResult.reason === 'not_found' ? 'Ticket not found.' : 'Workspace access does not permit this ticket.',
          });
          return;
        }
      }

      const comment = await addCommentRecord(req.params.ticketId, userId, body);
      const allComments = await listComments(req.params.ticketId);
      broadcastEvent('comments-updated', { ticketId: req.params.ticketId, comments: allComments });
      res.status(201).json(comment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add comment.' });
    }
  });

  router.get('/domains', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    try {
      const rows = await db.select().from(domains).where(eq(domains.projectId, projectId)).orderBy(asc(domains.createdAt));
      res.json(rows.map((domain) => ({ id: domain.id, name: domain.name, color: domain.color })));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load domains.' });
    }
  });

  router.post('/domains', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId || !req.body?.name) {
      res.status(400).json({ error: 'Project ID and domain name are required.' });
      return;
    }

    try {
      const rows = await db
        .insert(domains)
        .values({
          id: createId('d'),
          projectId,
          name: req.body.name,
          color: typeof req.body?.color === 'string' ? req.body.color : '#6B7280',
          createdAt: new Date(),
        })
        .returning();

      res.status(201).json({ id: rows[0].id, name: rows[0].name, color: rows[0].color });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create domain.' });
    }
  });

  router.get('/cycles', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    try {
      const rows = await db.select().from(cycles).where(eq(cycles.projectId, projectId)).orderBy(asc(cycles.startDate));
      res.json(rows.map(mapCycle));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load cycles.' });
    }
  });

  router.post('/cycles', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId || !req.body?.name || !req.body?.startDate || !req.body?.endDate) {
      res.status(400).json({ error: 'Project ID, cycle name, startDate, and endDate are required.' });
      return;
    }

    try {
      const rows = await db
        .insert(cycles)
        .values({
          id: createId('c'),
          projectId,
          name: req.body.name,
          startDate: new Date(req.body.startDate),
          endDate: new Date(req.body.endDate),
          completed: Boolean(req.body?.completed),
          createdAt: new Date(),
        })
        .returning();

      res.status(201).json(mapCycle(rows[0]));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create cycle.' });
    }
  });

  return router;
}