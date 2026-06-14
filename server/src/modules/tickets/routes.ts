import { and, asc, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { db } from '../../db/index.js';
import { cycles, labels, ticketLabels, projects, tickets } from '../../db/schema.js';
import { broadcastEvent } from '../../realtime.js';
import { createId, getProjectIdFromRequest, normalizeIsoDate } from '../../lib/platform.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { isWorkspaceMember, getProjectWorkspaceId, authorizeProjectAccess, authorizeTeamAccess } from '../workspaces/services/membership.js';
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
import {
  ProjectScopeStrategy,
  TeamScopeStrategy,
  WorkspaceScopeStrategy,
} from './services/scope-strategies.js';

function mapLabel(label: typeof labels.$inferSelect) {
  return {
    id: label.id,
    teamId: label.teamId,
    name: label.name,
    color: label.color,
    description: label.description,
    sortOrder: label.sortOrder,
  };
}

function mapCycle(cycle: typeof cycles.$inferSelect) {
  return {
    id: cycle.id,
    name: cycle.name,
    startDate: normalizeIsoDate(cycle.startDate),
    endDate: normalizeIsoDate(cycle.endDate),
    completed: cycle.completed ? 1 : 0,
  };
}

async function getRequiredProjectTeamId(projectId: string) {
  const projectRows = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const teamId = projectRows[0]?.teamId;
  if (!teamId) {
    throw new Error(`Project ${projectId} is missing a team assignment.`);
  }

  return teamId;
}

function normalizeLabelName(name: string) {
  return name.trim();
}

async function ensureLabelNameAvailable(teamId: string, name: string, excludeLabelId?: string) {
  const rows = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(eq(labels.teamId, teamId));

  const normalizedName = normalizeLabelName(name);
  return rows.find((row) => row.id !== excludeLabelId && normalizeLabelName(row.name) === normalizedName) ?? null;
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
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : getProjectIdFromRequest(req);
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

    let strategy: ProjectScopeStrategy | TeamScopeStrategy | WorkspaceScopeStrategy;
    if (projectId) {
      strategy = new ProjectScopeStrategy(projectId);
    } else if (teamId) {
      strategy = new TeamScopeStrategy(teamId);
    } else if (workspaceId) {
      strategy = new WorkspaceScopeStrategy(workspaceId);
    } else {
      res.status(400).json({ error: 'Either projectId, teamId, or workspaceId is required.' });
      return;
    }

    const auth = await strategy.authorize(req);
    if (!auth.allowed) {
      res.status(auth.status ?? 403).json({ error: auth.error });
      return;
    }

    try {
      const ticketList = await strategy.execute({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
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

        if (updated.projectId !== projectId) {
          broadcastEvent('tickets-updated', { projectId });
          broadcastEvent('tickets-updated', { projectId: updated.projectId });
        } else {
          broadcastEvent('tickets-updated', { projectId, tickets: await listTickets(projectId) });
        }
        res.json(updated);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'TARGET_PROJECT_NOT_FOUND') {
            res.status(404).json({ error: 'Target project not found.' });
            return;
          }
          if (error.message === 'TICKET_MOVE_CROSS_WORKSPACE') {
            res.status(400).json({ error: 'Tickets can only be moved within the same workspace.' });
            return;
          }
        }
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

  router.get('/labels', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : getProjectIdFromRequest(req);
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : (projectId ? await getRequiredProjectTeamId(projectId).catch(() => undefined) : undefined);

      if (!teamId) {
        res.status(400).json({ error: 'Either teamId or projectId is required, or project not found.' });
        return;
      }

      const auth = typeof req.query.teamId === 'string'
        ? await authorizeTeamAccess(req, teamId)
        : await authorizeProjectAccess(req, projectId as string);

      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
        return;
      }

      const rows = await db
        .select({
          id: labels.id,
          teamId: labels.teamId,
          name: labels.name,
          color: labels.color,
          description: labels.description,
          sortOrder: labels.sortOrder,
        })
        .from(labels)
        .where(eq(labels.teamId, teamId))
        .orderBy(asc(labels.createdAt));

      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load labels.' });
    }
  });

  router.post('/labels', async (req, res) => {
    try {
      const body = req.body ?? {};
      const projectId = typeof body.projectId === 'string' ? body.projectId : getProjectIdFromRequest(req);
      const bodyTeamId = typeof body.teamId === 'string' ? body.teamId : undefined;
      const resolvedTeamId = bodyTeamId ?? (projectId ? await getRequiredProjectTeamId(projectId).catch(() => undefined) : undefined);

      if (!resolvedTeamId) {
        res.status(400).json({ error: 'Either teamId or projectId is required, or project not found.' });
        return;
      }

      const auth = bodyTeamId
        ? await authorizeTeamAccess(req, resolvedTeamId)
        : await authorizeProjectAccess(req, projectId as string);

      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
        return;
      }

    const labelName = typeof body.name === 'string' ? normalizeLabelName(body.name) : '';
    if (!labelName) {
      res.status(400).json({ error: 'Label name is required.' });
      return;
    }

    const duplicate = await ensureLabelNameAvailable(resolvedTeamId, labelName);
    if (duplicate) {
      res.status(409).json({ error: 'Label name already exists in this team.' });
      return;
    }

    try {
      const rows = await db
        .insert(labels)
        .values({
          id: createId('l'),
          teamId: resolvedTeamId,
          name: labelName,
          color: typeof body.color === 'string' ? body.color : '#6B7280',
          description: typeof body.description === 'string' ? body.description : '',
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
          createdAt: new Date(),
        })
        .returning();

      res.status(201).json(mapLabel(rows[0]));
    } catch (error) {
      if (error instanceof Error && /unique/i.test(error.message)) {
        res.status(409).json({ error: 'Label name already exists in this team.' });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create label.' });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
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

      const auth = await authorizeTeamAccess(req, labelRow.teamId);
      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
        return;
      }

      const updates: any = {};
      if (typeof req.body?.name === 'string') {
        const normalizedName = normalizeLabelName(req.body.name);
        if (!normalizedName) {
          res.status(400).json({ error: 'Label name is required.' });
          return;
        }

        const duplicate = await ensureLabelNameAvailable(labelRow.teamId, normalizedName, labelId);
        if (duplicate) {
          res.status(409).json({ error: 'Label name already exists in this team.' });
          return;
        }

        updates.name = normalizedName;
      }
      if (typeof req.body?.color === 'string') updates.color = req.body.color;
      if (typeof req.body?.description === 'string') updates.description = req.body.description;
      if (typeof req.body?.sortOrder === 'number') updates.sortOrder = req.body.sortOrder;

      const rows = await db
        .update(labels)
        .set(updates)
        .where(eq(labels.id, labelId))
        .returning();

      res.json(mapLabel(rows[0]));
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

      const auth = await authorizeTeamAccess(req, labelRow.teamId);
      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
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
            teamId: labels.teamId,
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

        const teamId = await getRequiredProjectTeamId(ticket.projectId);
        if (labelRows[0].teamId !== teamId) {
          res.status(400).json({ error: 'Label does not belong to the ticket team.' });
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
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : getProjectIdFromRequest(req);

    try {
      if (teamId) {
        const auth = await authorizeTeamAccess(req, teamId);
        if (!auth.allowed) {
          res.status(auth.status ?? 403).json({ error: auth.error });
          return;
        }
        const rows = await db.select().from(cycles).where(eq(cycles.teamId, teamId)).orderBy(asc(cycles.startDate));
        res.json(rows.map(mapCycle));
      } else if (projectId) {
        const auth = await authorizeProjectAccess(req, projectId);
        if (!auth.allowed) {
          res.status(auth.status ?? 403).json({ error: auth.error });
          return;
        }
        const teamIdOfProject = await getRequiredProjectTeamId(projectId).catch(() => undefined);
        if (!teamIdOfProject) {
          res.status(400).json({ error: 'Project not found or missing team assignment.' });
          return;
        }
        const rows = await db.select().from(cycles).where(eq(cycles.teamId, teamIdOfProject)).orderBy(asc(cycles.startDate));
        res.json(rows.map(mapCycle));
      } else {
        res.status(400).json({ error: 'Either teamId or projectId is required.' });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load cycles.' });
    }
  });

  router.post('/cycles', async (req, res) => {
    const { name, startDate, endDate, completed, teamId } = req.body ?? {};
    const projectId = req.body?.projectId || getProjectIdFromRequest(req);

    if (!name || !startDate || !endDate) {
      res.status(400).json({ error: 'Cycle name, startDate, and endDate are required.' });
      return;
    }

    const targetTeamId = typeof teamId === 'string'
      ? teamId
      : projectId
        ? await getRequiredProjectTeamId(projectId)
        : undefined;

    if (!targetTeamId) {
      res.status(400).json({ error: 'Either teamId or projectId is required.' });
      return;
    }

    const auth = typeof teamId === 'string'
      ? await authorizeTeamAccess(req, targetTeamId)
      : await authorizeProjectAccess(req, projectId as string);

    if (!auth.allowed) {
      res.status(auth.status ?? 403).json({ error: auth.error });
      return;
    }

    try {
      const rows = await db
        .insert(cycles)
        .values({
          id: createId('c'),
          teamId: targetTeamId,
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          completed: Boolean(completed),
          createdAt: new Date(),
        })
        .returning();
      res.status(201).json(mapCycle(rows[0]));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create cycle.' });
    }
  });

  router.get('/tickets/:ticketId/dependencies', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        const rows = await db
          .select({
            id: tickets.id,
            key: tickets.key,
            title: tickets.title,
            projectId: tickets.projectId,
          })
          .from(tickets)
          .where(eq(tickets.blockedTicketId, ticket.id));
        res.json(rows);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list dependencies.' });
      }
    });
  });

  router.post('/tickets/:ticketId/dependencies', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      const dependencyId = req.body?.dependencyId;
      if (!dependencyId) {
        res.status(400).json({ error: 'Dependency ID is required.' });
        return;
      }

      if (dependencyId === ticket.id) {
        res.status(400).json({ error: 'A ticket cannot depend on itself.' });
        return;
      }

      const dependencyTicket = await getTicketById(dependencyId);
      if (!dependencyTicket) {
        res.status(404).json({ error: 'Dependency ticket not found.' });
        return;
      }

      const depAuth = await authorizeProjectAccess(req, dependencyTicket.projectId);
      if (!depAuth.allowed) {
        res.status(depAuth.status).json({ error: depAuth.error });
        return;
      }

      if (ticket.blockedTicketId === dependencyId) {
        res.status(400).json({ error: 'Circular dependency detected: this ticket is already blocking the target ticket.' });
        return;
      }

      if (dependencyTicket.blockedTicketId && dependencyTicket.blockedTicketId !== ticket.id) {
        res.status(400).json({ error: 'This ticket is already a dependency of another ticket.' });
        return;
      }

      try {
        await db
          .update(tickets)
          .set({ blockedTicketId: ticket.id })
          .where(eq(tickets.id, dependencyId));

        broadcastEvent('tickets-updated', { projectId: ticket.projectId });
        if (dependencyTicket.projectId !== ticket.projectId) {
          broadcastEvent('tickets-updated', { projectId: dependencyTicket.projectId });
        }

        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add dependency.' });
      }
    });
  });

  router.delete('/tickets/:ticketId/dependencies/:dependencyId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      const dependencyId = normalizeRouteParam(req.params.dependencyId);

      const dependencyTicket = await getTicketById(dependencyId);
      if (!dependencyTicket) {
        res.status(404).json({ error: 'Dependency ticket not found.' });
        return;
      }

      if (dependencyTicket.blockedTicketId !== ticket.id) {
        res.status(400).json({ error: 'Ticket is not a dependency of this ticket.' });
        return;
      }

      try {
        await db
          .update(tickets)
          .set({ blockedTicketId: null })
          .where(eq(tickets.id, dependencyId));

        broadcastEvent('tickets-updated', { projectId: ticket.projectId });
        if (dependencyTicket.projectId !== ticket.projectId) {
          broadcastEvent('tickets-updated', { projectId: dependencyTicket.projectId });
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove dependency.' });
      }
    });
  });

  return router;
}
