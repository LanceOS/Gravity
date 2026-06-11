import { and, asc, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { db } from '../../db/index.js';
import { cycles, domains, labels, ticketLabels, projects, tickets, workspaceMembers } from '../../db/schema.js';
import { broadcastEvent } from '../../realtime.js';
import { createId, getProjectIdFromRequest, normalizeIsoDate } from '../../lib/platform.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { isWorkspaceMember, getProjectWorkspaceId, authorizeProjectAccess } from '../workspaces/services/membership.js';
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
} from './services/tickets.js';

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

  async function withProjectAccess(
    req: Request,
    res: Response,
    projectId: string | null | undefined,
    handler: (projectId: string, userId: string) => Promise<void>
  ) {
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await handler(projectId, auth.userId);
  }

  async function withTicketAccess(
    req: Request,
    res: Response,
    ticketId: string,
    handler: (ticket: any, userId: string) => Promise<void>
  ) {
    const ticket = await getTicketById(ticketId, getProjectIdFromRequest(req) || undefined);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, ticket.projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await handler(ticket, auth.userId);
  }

  router.get('/tickets', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
      try {
        const ticketList = await listTickets(projectId, {
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
          domainId: typeof req.query.domainId === 'string' ? req.query.domainId : undefined,
          assigneeId: typeof req.query.assigneeId === 'string' ? req.query.assigneeId : undefined,
          cycleId: typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined,
          labels: typeof req.query.labels === 'string' ? req.query.labels.split(',').filter(Boolean) : undefined,
          labelMode: (req.query.labelMode === 'all' || req.query.labelMode === 'any') ? req.query.labelMode : undefined,
        });
        res.json(ticketList);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load tickets.' });
      }
    });
  });

  router.post('/tickets', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
      if (!req.body?.title) {
        res.status(400).json({ error: 'Ticket title is required.' });
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
          labelIds: Array.isArray(req.body.labelIds)
            ? req.body.labelIds.map(String)
            : typeof req.body.labelIds === 'string'
              ? req.body.labelIds.split(',').filter(Boolean)
              : undefined,
        });

        broadcastEvent('tickets-updated', { projectId, tickets: await listTickets(projectId) });
        res.status(201).json(created);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create ticket.' });
      }
    });
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

      const auth = await authorizeProjectAccess(req, ticket.projectId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      res.json(ticket);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load ticket.' });
    }
  });

  router.get('/tickets/:ticketId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        const ticketDetails = await getTicketDetails(ticket.id, ticket.projectId);
        res.json(ticketDetails);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load ticket.' });
      }
    });
  });

  router.patch('/tickets/:ticketId', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
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
  });

  router.delete('/tickets/:ticketId', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
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
  });

  router.get('/tickets/:ticketId/comments', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        res.json(await listComments(ticket.id));
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load comments.' });
      }
    });
  });

  router.post('/tickets/:ticketId/comments', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId) => {
      try {
        const body =
          typeof req.body?.content === 'string'
            ? req.body.content
            : typeof req.body?.body === 'string'
              ? req.body.body
              : '';

        if (!body) {
          res.status(400).json({ error: 'Comment body is required.' });
          return;
        }

        const comment = await addCommentRecord(ticket.id, userId, body);
        const allComments = await listComments(ticket.id);
        broadcastEvent('comments-updated', { ticketId: ticket.id, comments: allComments });
        res.status(201).json(comment);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add comment.' });
      }
    });
  });

  router.patch('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        const commentId = normalizeRouteParam(req.params.commentId);
        const body = typeof req.body?.body === 'string' ? req.body.body : '';

        if (!body) {
          res.status(400).json({ error: 'Comment body is required.' });
          return;
        }

        const comment = await updateCommentRecord(commentId, ticket.id, body);
        if (!comment) {
          res.status(404).json({ error: 'Comment not found.' });
          return;
        }

        const allComments = await listComments(ticket.id);
        broadcastEvent('comments-updated', { ticketId: ticket.id, comments: allComments });
        res.json(comment);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update comment.' });
      }
    });
  });

  router.delete('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        const commentId = normalizeRouteParam(req.params.commentId);
        const deleted = await deleteCommentRecord(commentId, ticket.id);
        if (!deleted) {
          res.status(404).json({ error: 'Comment not found.' });
          return;
        }

        const allComments = await listComments(ticket.id);
        broadcastEvent('comments-updated', { ticketId: ticket.id, comments: allComments });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete comment.' });
      }
    });
  });

  router.get('/domains', async (req, res) => {
    res.set('Warning', '299 - "Domains API is deprecated. Use Labels API instead."');
    res.status(404).json({ error: 'Domains API is deprecated. Use Labels API instead.' });
  });

  router.post('/domains', async (req, res) => {
    res.set('Warning', '299 - "Domains API is deprecated. Use Labels API instead."');
    res.status(404).json({ error: 'Domains API is deprecated. Use Labels API instead.' });
  });

  router.get('/labels', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
      try {
        const rows = await db
          .select({
            id: labels.id,
            projectId: labels.projectId,
            name: labels.name,
            color: labels.color,
            description: labels.description,
            sortOrder: labels.sortOrder,
          })
          .from(labels)
          .where(eq(labels.projectId, projectId))
          .orderBy(asc(labels.createdAt));
        res.json(rows);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load labels.' });
      }
    });
  });

  router.post('/labels', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
      if (!req.body?.name) {
        res.status(400).json({ error: 'Label name is required.' });
        return;
      }

      try {
        const rows = await db
          .insert(labels)
          .values({
            id: createId('l'),
            projectId,
            name: req.body.name,
            color: typeof req.body?.color === 'string' ? req.body.color : '#6B7280',
            description: typeof req.body?.description === 'string' ? req.body.description : '',
            sortOrder: typeof req.body?.sortOrder === 'number' ? req.body.sortOrder : 0,
            createdAt: new Date(),
          })
          .returning();

        res.status(201).json({
          id: rows[0].id,
          projectId: rows[0].projectId,
          name: rows[0].name,
          color: rows[0].color,
          description: rows[0].description,
          sortOrder: rows[0].sortOrder,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create label.' });
      }
    });
  });

  router.put('/labels/:id', async (req, res) => {
    const labelId = normalizeRouteParam(req.params.id);
    if (!labelId) {
      res.status(400).json({ error: 'Label ID is required.' });
      return;
    }

    try {
      const labelRows = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
      const labelRow = labelRows[0];
      if (!labelRow) {
        res.status(404).json({ error: 'Label not found.' });
        return;
      }

      const auth = await authorizeProjectAccess(req, labelRow.projectId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const updates: any = {};
      if (typeof req.body?.name === 'string') updates.name = req.body.name;
      if (typeof req.body?.color === 'string') updates.color = req.body.color;
      if (typeof req.body?.description === 'string') updates.description = req.body.description;
      if (typeof req.body?.sortOrder === 'number') updates.sortOrder = req.body.sortOrder;

      const rows = await db
        .update(labels)
        .set(updates)
        .where(eq(labels.id, labelId))
        .returning();

      res.json({
        id: rows[0].id,
        projectId: rows[0].projectId,
        name: rows[0].name,
        color: rows[0].color,
        description: rows[0].description,
        sortOrder: rows[0].sortOrder,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update label.' });
    }
  });

  router.delete('/labels/:id', async (req, res) => {
    const labelId = normalizeRouteParam(req.params.id);
    if (!labelId) {
      res.status(400).json({ error: 'Label ID is required.' });
      return;
    }

    try {
      const labelRows = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
      const labelRow = labelRows[0];
      if (!labelRow) {
        res.status(404).json({ error: 'Label not found.' });
        return;
      }

      const auth = await authorizeProjectAccess(req, labelRow.projectId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      await db.transaction(async (tx) => {
        await tx.delete(ticketLabels).where(eq(ticketLabels.labelId, labelId));
        await tx.delete(labels).where(eq(labels.id, labelId));
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete label.' });
    }
  });

  router.get('/tickets/:id/labels', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket) => {
      try {
        const rows = await db
          .select({
            id: labels.id,
            projectId: labels.projectId,
            name: labels.name,
            color: labels.color,
            description: labels.description,
            sortOrder: labels.sortOrder,
          })
          .from(ticketLabels)
          .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
          .where(eq(ticketLabels.ticketId, ticket.id));

        res.json(rows);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load ticket labels.' });
      }
    });
  });

  router.post('/tickets/:id/labels', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket) => {
      try {
        const labelId = req.body?.labelId;
        if (!labelId) {
          res.status(400).json({ error: 'Label ID is required.' });
          return;
        }

        const labelRows = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
        if (labelRows.length === 0) {
          res.status(404).json({ error: 'Label not found.' });
          return;
        }

        if (labelRows[0].projectId !== ticket.projectId) {
          res.status(400).json({ error: 'Label does not belong to the ticket project.' });
          return;
        }

        await db
          .insert(ticketLabels)
          .values({ ticketId: ticket.id, labelId })
          .onConflictDoNothing();

        broadcastEvent('tickets-updated', { projectId: ticket.projectId, tickets: await listTickets(ticket.projectId) });

        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to assign label to ticket.' });
      }
    });
  });

  router.delete('/tickets/:id/labels/:labelId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket) => {
      try {
        const labelId = normalizeRouteParam(req.params.labelId);
        await db
          .delete(ticketLabels)
          .where(and(eq(ticketLabels.ticketId, ticket.id), eq(ticketLabels.labelId, labelId)));

        broadcastEvent('tickets-updated', { projectId: ticket.projectId, tickets: await listTickets(ticket.projectId) });

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unassign label from ticket.' });
      }
    });
  });

  router.get('/cycles', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
      try {
        const rows = await db.select().from(cycles).where(eq(cycles.projectId, projectId)).orderBy(asc(cycles.startDate));
        res.json(rows.map(mapCycle));
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load cycles.' });
      }
    });
  });

  router.post('/cycles', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId) => {
      if (!req.body?.name || !req.body?.startDate || !req.body?.endDate) {
        res.status(400).json({ error: 'Cycle name, startDate, and endDate are required.' });
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
  });

  return router;
}
