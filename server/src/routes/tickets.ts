import { and, asc, eq } from 'drizzle-orm';
import { type Response, Router } from 'express';
import { db } from '../db/index.js';
import { cycles, domains, projects, tickets, workspaceMembers } from '../db/schema.js';
import { broadcastEvent } from '../realtime.js';
import { createId, getProjectIdFromRequest, normalizeIsoDate } from '../lib/platform.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import {
  addCommentRecord,
  createTicketRecord,
  getTicketById,
  deleteTicketRecord,
  getTicketDetails,
  listComments,
  listTickets,
  updateTicketRecord,
  updateCommentRecord,
  deleteCommentRecord,
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

  function normalizeRouteParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] ?? '' : value;
  }

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

  router.get('/tickets/key/:ticketKey', async (req, res) => {
    try {
      const ticketKey = normalizeRouteParam(req.params.ticketKey).trim().toUpperCase();
      const ticketRows = await db
        .select({
          id: tickets.id,
          key: tickets.key,
          title: tickets.title,
          status: tickets.status,
          projectId: tickets.projectId,
        })
        .from(tickets)
        .where(eq(tickets.key, ticketKey))
        .limit(1);
      const ticket = ticketRows[0];
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      const actorUserId = await resolveRequestActorUserId(req);
      const userId = actorUserId ?? (typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : typeof req.query.userId === 'string' ? req.query.userId : undefined);
      if (userId) {
        // Get the ticket's workspace ID
        const projectRows = await db
          .select({ workspaceId: projects.workspaceId })
          .from(projects)
          .where(eq(projects.id, ticket.projectId))
          .limit(1);
        const project = projectRows[0];
        if (!project) {
          res.status(404).json({ error: 'Ticket project not found.' });
          return;
        }

        // Check if the user is a member of the workspace
        const memberRows = await db
          .select()
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.workspaceId, project.workspaceId),
            eq(workspaceMembers.userId, userId)
          ))
          .limit(1);

        if (memberRows.length === 0) {
          res.status(403).json({ error: 'Access denied: not a member of the workspace.' });
          return;
        }
      }

      res.json(ticket);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load ticket.' });
    }
  });

  router.get('/tickets/:ticketId', async (req, res) => {
    try {
      const ticketId = normalizeRouteParam(req.params.ticketId);
      const ticket = await getTicketDetails(ticketId, getProjectIdFromRequest(req) || undefined);
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
      const ticketId = normalizeRouteParam(req.params.ticketId);
      const updated = await updateTicketRecord(ticketId, req.body ?? {}, projectId);
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
      const ticketId = normalizeRouteParam(req.params.ticketId);
      const deleted = await deleteTicketRecord(ticketId, projectId);
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
      const ticketId = normalizeRouteParam(req.params.ticketId);
      res.json(await listComments(ticketId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load comments.' });
    }
  });

  router.post('/tickets/:ticketId/comments', async (req, res) => {
    const ticketId = normalizeRouteParam(req.params.ticketId);
    const actorUserId = await resolveRequestActorUserId(req);
    const userId = actorUserId ?? (typeof req.body?.userId === 'string' ? req.body.userId : '');
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

      const comment = await addCommentRecord(ticketId, userId, body);
      const allComments = await listComments(ticketId);
      broadcastEvent('comments-updated', { ticketId, comments: allComments });
      res.status(201).json(comment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add comment.' });
    }
  });

  router.patch('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    const ticketId = normalizeRouteParam(req.params.ticketId);
    const commentId = normalizeRouteParam(req.params.commentId);
    const body = typeof req.body?.body === 'string' ? req.body.body : '';

    if (!body) {
      res.status(400).json({ error: 'Comment body is required.' });
      return;
    }

    try {

      const comment = await updateCommentRecord(commentId, ticketId, body);
      if (!comment) {
        res.status(404).json({ error: 'Comment not found.' });
        return;
      }

      const allComments = await listComments(ticketId);
      broadcastEvent('comments-updated', { ticketId, comments: allComments });
      res.json(comment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update comment.' });
    }
  });

  router.delete('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    const ticketId = normalizeRouteParam(req.params.ticketId);
    const commentId = normalizeRouteParam(req.params.commentId);

    try {

      const deleted = await deleteCommentRecord(commentId, ticketId);
      if (!deleted) {
        res.status(404).json({ error: 'Comment not found.' });
        return;
      }

      const allComments = await listComments(ticketId);
      broadcastEvent('comments-updated', { ticketId, comments: allComments });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete comment.' });
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