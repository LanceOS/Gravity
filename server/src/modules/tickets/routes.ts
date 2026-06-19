import { and, asc, eq, isNull } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { db } from '../../db/index.js';
import { cycles, labels, projects, teams, ticketLabels, tickets, workspaceSettings } from '../../db/schema.js';
import { broadcastToWorkspace } from '../../realtime.js';
import {
  createId,
  getProjectIdFromRequest,
  WorkspaceCacheInvalidationReason,
  invalidateWorkspaceCache,
  normalizeIsoDate,
} from '../../lib/platform.js';
import { authorizeProjectAccess, authorizeTeamAccess, getProjectTeamId } from '../workspaces/services/membership.js';
import {
  addCommentRecord,
  createTicketRecord,
  createTicketDependencyRelation,
  getTicketById,
  getTicketByKey,
  getTicketRelationsByKey,
  deleteTicketRecord,
  hasTicketDependencyRelation,
  hasCircularDependency,
  getTicketDetails,
  listComments,
  listTicketBlockers,
  listTicketDependencies,
  updateTicketRecord,
  updateCommentRecord,
  deleteCommentRecord,
  removeTicketDependencyRelation,
  getProjectScope,
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
    projectId: label.projectId ? String(label.projectId) : undefined,
    name: label.name,
    color: label.color,
    description: label.description,
    sortOrder: label.sortOrder,
  };
}

const labelSelectFields = {
  id: labels.id,
  teamId: labels.teamId,
  projectId: labels.projectId,
  name: labels.name,
  color: labels.color,
  description: labels.description,
  sortOrder: labels.sortOrder,
} as const;

function mapCycle(cycle: typeof cycles.$inferSelect) {
  return {
    id: cycle.id,
    name: cycle.name,
    startDate: normalizeIsoDate(cycle.startDate),
    endDate: normalizeIsoDate(cycle.endDate),
    completed: cycle.completed ? 1 : 0,
  };
}

function normalizeLabelName(name: string) {
  return name.trim();
}

async function ensureLabelNameAvailable(
  scope: { teamId: string; projectId?: string | null },
  name: string,
  excludeLabelId?: string,
) {
  const rows = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(
      scope.projectId
        ? eq(labels.projectId, scope.projectId)
        : and(eq(labels.teamId, scope.teamId), isNull(labels.projectId)),
    );

  const normalizedName = normalizeLabelName(name);
  return rows.find((row) => row.id !== excludeLabelId && normalizeLabelName(row.name) === normalizedName) ?? null;
}

export function createTicketsRouter() {
  const router = Router();

  function normalizeRouteParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] ?? '' : value;
  }

  function parseIntQueryParam(value: unknown) {
    if (!value) {
      return undefined;
    }

    const normalized = Array.isArray(value) ? value[0] : value;
    if (typeof normalized !== 'string') {
      return undefined;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return parsed;
  }

  async function withProjectAccess(
    req: Request,
    res: Response,
    projectId: string | null | undefined,
    handler: (projectId: string, userId: string, workspaceId: string) => Promise<void>
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

    await handler(projectId, auth.userId, auth.workspaceId);
  }

  async function withTicketAccess(
    req: Request,
    res: Response,
    ticketId: string,
    handler: (ticket: any, userId: string, workspaceId: string) => Promise<void>
  ) {
    // Ticket IDs are globally unique, so look them up directly instead of
    // requiring the caller to send a matching project scope header. That keeps
    // relation actions working even when the UI's project context is stale.
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, ticket.projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await handler(ticket, auth.userId, auth.workspaceId);
  }

  async function invalidateSidebarCacheFromTeam(teamId: string) {
    const teamRows = await db.select({ workspaceId: teams.workspaceId }).from(teams).where(eq(teams.id, teamId)).limit(1);
    const workspaceId = teamRows[0]?.workspaceId;
    if (!workspaceId) {
      return;
    }

    await invalidateWorkspaceCache(workspaceId, WorkspaceCacheInvalidationReason.TEAM_STRUCTURE_CHANGED);
  }

  async function getTeamWorkspaceScope(teamId: string) {
    const rows = await db
      .select({
        workspaceId: teams.workspaceId,
        hierarchyMode: workspaceSettings.hierarchyMode,
      })
      .from(teams)
      .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, teams.workspaceId))
      .where(eq(teams.id, teamId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      workspaceId: row.workspaceId,
      hierarchyMode: row.hierarchyMode === 'teams' ? 'teams' as const : 'flat' as const,
    };
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
      const queryLimit = parseIntQueryParam(req.query.limit);
      const queryOffset = parseIntQueryParam(req.query.offset);

      const ticketList = await strategy.execute({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
        assigneeId: typeof req.query.assigneeId === 'string' ? req.query.assigneeId : undefined,
        cycleId: typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined,
        labels: typeof req.query.labels === 'string' ? req.query.labels.split(',').filter(Boolean) : undefined,
        labelMode: (req.query.labelMode === 'all' || req.query.labelMode === 'any') ? req.query.labelMode : undefined,
        limit: queryLimit,
        offset: queryOffset,
      });
      res.json(ticketList);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load tickets.' });
    }
  });

  router.post('/tickets', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId, _userId, workspaceId) => {
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

        broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId });
        res.status(201).json(created);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create ticket.' });
      }
    });
  });

  router.get('/tickets/key/:ticketKey', async (req, res) => {
    try {
      const ticketKey = normalizeRouteParam(req.params.ticketKey).trim().toUpperCase();
      const ticket = await getTicketByKey(ticketKey);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      const auth = await authorizeProjectAccess(req, ticket.projectId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const includeRelations = typeof req.query.include === 'string'
        && req.query.include.split(',').map((value) => value.trim()).includes('relations');

      if (includeRelations) {
        const ticketRelations = await getTicketRelationsByKey(ticketKey);
        if (!ticketRelations) {
          res.status(404).json({ error: 'Ticket not found.' });
          return;
        }

        res.json(ticketRelations);
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
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId, _userId, workspaceId) => {
      try {
        const ticketId = normalizeRouteParam(req.params.ticketId);
        const updated = await updateTicketRecord(ticketId, req.body ?? {}, projectId);
        if (!updated) {
          res.status(404).json({ error: 'Ticket not found.' });
          return;
        }

        // Cross-project moves stay within the same workspace; one broadcast suffices
        // for the owning workspace but we still send two payloads so the client can
        // refresh both project views.
        broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId });
        if (updated.projectId !== projectId) {
          broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId: updated.projectId });
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
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId, _userId, workspaceId) => {
      try {
        const ticketId = normalizeRouteParam(req.params.ticketId);
        const deleted = await deleteTicketRecord(ticketId, projectId);
        if (!deleted) {
          res.status(404).json({ error: 'Ticket not found.' });
          return;
        }

        broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId });
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
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
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
        broadcastToWorkspace(workspaceId, 'comments-updated', { ticketId: ticket.id });
        res.status(201).json(comment);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add comment.' });
      }
    });
  });

  router.patch('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, _userId, workspaceId) => {
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

        broadcastToWorkspace(workspaceId, 'comments-updated', { ticketId: ticket.id });
        res.json(comment);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update comment.' });
      }
    });
  });

  router.delete('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, _userId, workspaceId) => {
      try {
        const commentId = normalizeRouteParam(req.params.commentId);
        const deleted = await deleteCommentRecord(commentId, ticket.id);
        if (!deleted) {
          res.status(404).json({ error: 'Comment not found.' });
          return;
        }

        broadcastToWorkspace(workspaceId, 'comments-updated', { ticketId: ticket.id });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete comment.' });
      }
    });
  });

  router.get('/labels', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : getProjectIdFromRequest(req);
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;

      if (!teamId && !projectId) {
        res.status(400).json({ error: 'Either teamId or projectId is required, or project not found.' });
        return;
      }

      if (typeof req.query.teamId === 'string') {
        const auth = await authorizeTeamAccess(req, teamId as string);
        if (!auth.allowed) {
          res.status(auth.status ?? 403).json({ error: auth.error });
          return;
        }

        const rows = await db
          .select(labelSelectFields)
          .from(labels)
          .where(and(eq(labels.teamId, teamId as string), isNull(labels.projectId)))
          .orderBy(asc(labels.createdAt));

        res.json(rows);
        return;
      }

      const projectScope = await getProjectScope(projectId as string);
      if (!projectScope) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const auth = await authorizeProjectAccess(req, projectId as string);
      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
        return;
      }

      const rows = await db
        .select(labelSelectFields)
        .from(labels)
        .where(
          projectScope.hierarchyMode === 'flat'
            ? eq(labels.projectId, projectId as string)
            : and(eq(labels.teamId, projectScope.teamId), isNull(labels.projectId)),
        )
        .orderBy(asc(labels.createdAt));

      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load labels.' });
    }
  });

  router.post('/labels', async (req, res) => {
    let resolvedProjectId: string | null = null;
    try {
      const body = req.body ?? {};
      const projectId = typeof body.projectId === 'string' ? body.projectId : getProjectIdFromRequest(req);
      const bodyTeamId = typeof body.teamId === 'string' ? body.teamId : undefined;
      const labelName = typeof body.name === 'string' ? normalizeLabelName(body.name) : '';
      if (!labelName) {
        res.status(400).json({ error: 'Label name is required.' });
        return;
      }

      let resolvedTeamId = '';
      let auth:
        | Awaited<ReturnType<typeof authorizeTeamAccess>>
        | Awaited<ReturnType<typeof authorizeProjectAccess>>;

      if (projectId) {
        const projectScope = await getProjectScope(projectId);
        if (!projectScope) {
          res.status(404).json({ error: 'Project not found.' });
          return;
        }

        if (bodyTeamId && bodyTeamId !== projectScope.teamId) {
          res.status(400).json({ error: 'Team does not own this project.' });
          return;
        }

        resolvedTeamId = projectScope.teamId;
        resolvedProjectId = projectScope.hierarchyMode === 'flat' ? projectId : null;
        auth = await authorizeProjectAccess(req, projectId);
      } else if (bodyTeamId) {
        resolvedTeamId = bodyTeamId;
        auth = await authorizeTeamAccess(req, bodyTeamId);

        if (auth.allowed) {
          const teamScope = await getTeamWorkspaceScope(bodyTeamId);
          if (!teamScope) {
            res.status(404).json({ error: 'Team not found.' });
            return;
          }

          if (teamScope.hierarchyMode !== 'teams') {
            res.status(400).json({ error: 'Project ID is required to create labels in project-based workspaces.' });
            return;
          }
        }
      } else {
        res.status(400).json({ error: 'Either teamId or projectId is required, or project not found.' });
        return;
      }

      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
        return;
      }

      const duplicate = await ensureLabelNameAvailable({ teamId: resolvedTeamId, projectId: resolvedProjectId }, labelName);
      if (duplicate) {
        res.status(409).json({
          error: resolvedProjectId
            ? 'Label name already exists in this project.'
            : 'Label name already exists in this team.',
        });
        return;
      }

      const rows = await db
        .insert(labels)
        .values({
          id: createId('l'),
          teamId: resolvedTeamId,
          projectId: resolvedProjectId ?? null,
          name: labelName,
          color: typeof body.color === 'string' ? body.color : '#6B7280',
          description: typeof body.description === 'string' ? body.description : '',
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
          createdAt: new Date(),
        })
        .returning();

      await invalidateSidebarCacheFromTeam(resolvedTeamId);

      res.status(201).json(mapLabel(rows[0]));
    } catch (error) {
      if (error instanceof Error && /unique/i.test(error.message)) {
        res.status(409).json({
          error: resolvedProjectId
            ? 'Label name already exists in this project.'
            : 'Label name already exists in this team.',
        });
        return;
      }
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

      const auth = labelRow.projectId
        ? await authorizeProjectAccess(req, labelRow.projectId)
        : await authorizeTeamAccess(req, labelRow.teamId);
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

        const duplicate = await ensureLabelNameAvailable(
          { teamId: labelRow.teamId, projectId: labelRow.projectId },
          normalizedName,
          labelId,
        );
        if (duplicate) {
          res.status(409).json({
            error: labelRow.projectId
              ? 'Label name already exists in this project.'
              : 'Label name already exists in this team.',
          });
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

      await invalidateSidebarCacheFromTeam(labelRow.teamId);

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

      const auth = labelRow.projectId
        ? await authorizeProjectAccess(req, labelRow.projectId)
        : await authorizeTeamAccess(req, labelRow.teamId);
      if (!auth.allowed) {
        res.status(auth.status ?? 403).json({ error: auth.error });
        return;
      }

      await db.transaction(async (tx) => {
        await tx.delete(ticketLabels).where(eq(ticketLabels.labelId, labelId));
        await tx.delete(labels).where(eq(labels.id, labelId));
      });

      await invalidateSidebarCacheFromTeam(labelRow.teamId);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete label.' });
    }
  });

  router.get('/tickets/:id/labels', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket) => {
      try {
        const rows = await db
          .select(labelSelectFields)
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
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket, _userId, workspaceId) => {
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

        const projectScope = await getProjectScope(ticket.projectId);
        if (!projectScope) {
          res.status(404).json({ error: 'Project not found.' });
          return;
        }

        const labelRow = labelRows[0];
        const labelAllowed = projectScope.hierarchyMode === 'flat'
          ? labelRow.projectId === ticket.projectId
          : labelRow.projectId === null && labelRow.teamId === projectScope.teamId;

        if (!labelAllowed) {
          res.status(400).json({
            error: projectScope.hierarchyMode === 'flat'
              ? 'Label does not belong to the ticket project.'
              : 'Label does not belong to the ticket team.',
          });
          return;
        }

        await db
          .insert(ticketLabels)
          .values({ ticketId: ticket.id, labelId })
          .onConflictDoNothing();

        broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId: ticket.projectId });

        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to assign label to ticket.' });
      }
    });
  });

  router.delete('/tickets/:id/labels/:labelId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket, _userId, workspaceId) => {
      try {
        const labelId = normalizeRouteParam(req.params.labelId);
        await db
          .delete(ticketLabels)
          .where(and(eq(ticketLabels.ticketId, ticket.id), eq(ticketLabels.labelId, labelId)));

        broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId: ticket.projectId });

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
        const teamIdOfProject = projectId ? (await getProjectTeamId(projectId)) ?? undefined : undefined;
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
        ? (projectId ? (await getProjectTeamId(projectId)) ?? undefined : undefined)
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

      await invalidateSidebarCacheFromTeam(targetTeamId);
      res.status(201).json(mapCycle(rows[0]));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create cycle.' });
    }
  });

  router.get('/tickets/:ticketId/dependencies', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        const rows = await listTicketDependencies(ticket.id);
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

      if (await hasTicketDependencyRelation(ticket.id, dependencyId)) {
        res.status(400).json({ error: 'This ticket already blocks the selected ticket.' });
        return;
      }

      if (await hasTicketDependencyRelation(dependencyId, ticket.id)) {
        res.status(400).json({ error: 'This ticket is already blocked by the selected ticket.' });
        return;
      }

      if (await hasCircularDependency(dependencyId, ticket.id)) {
        res.status(400).json({ error: 'Circular dependency detected.' });
        return;
      }

      try {
        await createTicketDependencyRelation(ticket.id, dependencyId, ticket.projectId);

        broadcastToWorkspace(depAuth.workspaceId, 'tickets-updated', { projectId: ticket.projectId });
        if (dependencyTicket.projectId !== ticket.projectId) {
          broadcastToWorkspace(depAuth.workspaceId, 'tickets-updated', { projectId: dependencyTicket.projectId });
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

      const depAuth = await authorizeProjectAccess(req, dependencyTicket.projectId);
      if (!depAuth.allowed) {
        res.status(depAuth.status).json({ error: depAuth.error });
        return;
      }

      if (!(await hasTicketDependencyRelation(ticket.id, dependencyId))) {
        res.status(400).json({ error: 'Ticket is not a dependency of this ticket.' });
        return;
      }

      try {
        await removeTicketDependencyRelation(ticket.id, dependencyId);

        broadcastToWorkspace(depAuth.workspaceId, 'tickets-updated', { projectId: ticket.projectId });
        if (dependencyTicket.projectId !== ticket.projectId) {
          broadcastToWorkspace(depAuth.workspaceId, 'tickets-updated', { projectId: dependencyTicket.projectId });
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove dependency.' });
      }
    });
  });

  router.get('/tickets/:ticketId/blockers', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      try {
        const rows = await listTicketBlockers(ticket.id);
        res.json(rows);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list blockers.' });
      }
    });
  });

  router.post('/tickets/:ticketId/blockers', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      const blockerId = req.body?.blockerId;
      if (!blockerId) {
        res.status(400).json({ error: 'Blocker ID is required.' });
        return;
      }

      if (blockerId === ticket.id) {
        res.status(400).json({ error: 'A ticket cannot block itself.' });
        return;
      }

      const blockerTicket = await getTicketById(blockerId);
      if (!blockerTicket) {
        res.status(404).json({ error: 'Blocker ticket not found.' });
        return;
      }

      const blockerAuth = await authorizeProjectAccess(req, blockerTicket.projectId);
      if (!blockerAuth.allowed) {
        res.status(blockerAuth.status).json({ error: blockerAuth.error });
        return;
      }

      if (await hasTicketDependencyRelation(blockerId, ticket.id)) {
        res.status(400).json({ error: 'This ticket already has the selected blocker.' });
        return;
      }

      if (await hasTicketDependencyRelation(ticket.id, blockerId)) {
        res.status(400).json({ error: 'This ticket already blocks the selected ticket.' });
        return;
      }

      if (await hasCircularDependency(ticket.id, blockerId)) {
        res.status(400).json({ error: 'Circular dependency detected.' });
        return;
      }

      try {
        await createTicketDependencyRelation(blockerId, ticket.id, ticket.projectId);

        broadcastToWorkspace(blockerAuth.workspaceId, 'tickets-updated', { projectId: ticket.projectId });
        if (blockerTicket.projectId !== ticket.projectId) {
          broadcastToWorkspace(blockerAuth.workspaceId, 'tickets-updated', { projectId: blockerTicket.projectId });
        }

        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add blocker.' });
      }
    });
  });

  router.delete('/tickets/:ticketId/blockers/:blockerId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket) => {
      const blockerId = normalizeRouteParam(req.params.blockerId);

      const blockerTicket = await getTicketById(blockerId);
      if (!blockerTicket) {
        res.status(404).json({ error: 'Blocker ticket not found.' });
        return;
      }

      const blockerAuth = await authorizeProjectAccess(req, blockerTicket.projectId);
      if (!blockerAuth.allowed) {
        res.status(blockerAuth.status).json({ error: blockerAuth.error });
        return;
      }

      if (!(await hasTicketDependencyRelation(blockerId, ticket.id))) {
        res.status(400).json({ error: 'Ticket is not a blocker of this ticket.' });
        return;
      }

      try {
        await removeTicketDependencyRelation(blockerId, ticket.id);

        broadcastToWorkspace(blockerAuth.workspaceId, 'tickets-updated', { projectId: ticket.projectId });
        if (blockerTicket.projectId !== ticket.projectId) {
          broadcastToWorkspace(blockerAuth.workspaceId, 'tickets-updated', { projectId: blockerTicket.projectId });
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove blocker.' });
      }
    });
  });

  return router;
}
