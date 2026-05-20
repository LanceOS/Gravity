import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { cycles, domains, tickets } from '../db/schema.js';
import { broadcastEvent } from '../realtime.js';
import { createId, getProjectIdFromRequest, normalizeIsoDate } from '../lib/platform.js';
import {
  addCommentRecord,
  createTicketRecord,
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

  router.get('/tickets/:ticketId/comments', async (req, res) => {
    try {
      res.json(await listComments(req.params.ticketId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load comments.' });
    }
  });

  router.post('/tickets/:ticketId/comments', async (req, res) => {
    const { userId, body } = req.body ?? {};
    if (!userId || !body) {
      res.status(400).json({ error: 'userId and body are required.' });
      return;
    }

    try {
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