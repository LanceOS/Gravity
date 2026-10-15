import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { cycles, labels, projects, teams, ticketLabels, tickets, workspaceSettings } from '../../db/schema.js';
import { broadcastToWorkspace } from '../../realtime.js';
import {
  createId,
  getProjectIdFromRequest,
  WorkspaceCacheInvalidationReason,
  invalidateWorkspaceCache,
} from '../../lib/platform.js';
import { audit } from '../../lib/logger.js';
import { authorizeProjectAccess, authorizeTeamAccess, authorizeWorkspaceAccess, getProjectTeamId } from '../workspaces/services/membership.js';
import {
  addCommentRecord,
  createTicketRecord,
  createTicketDependencyRelation,
  getTicketById,
  getTicketByKey,
  getTicketRelationsByKey,
  deleteTicketRecordWithEffects,
  hasTicketDependencyRelation,
  hasCircularDependency,
  getTicketDetails,
  getRelationshipCleanupEventTargets,
  listComments,
  listTicketBlockers,
  listTicketDependencies,
  updateTicketRecordWithEffects,
  updateCommentRecord,
  deleteCommentRecord,
  removeTicketDependencyRelation,
  getProjectScope,
  COMMENT_BODY_EMPTY_AFTER_SANITIZATION,
  TICKET_ASSIGNEE_SCOPE_VIOLATION,
  TICKET_DEPENDENCY_WORKSPACE_CONFLICT,
  type TicketRelationshipCleanupEffect,
} from './services/tickets.js';
import {
  ProjectScopeStrategy,
  TeamScopeStrategy,
  WorkspaceScopeStrategy,
} from './services/scope-strategies.js';
import { CycleError, createCycleRecord, createCycleSchema, deleteCycleRecord, editCycleRecord, editCycleSchema, getCycleRecord, mapCycle } from './services/cycles.js';

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

const bulkTriageSchema = z.strictObject({
  workspaceId: z.string().min(1),
  tickets: z.array(z.strictObject({
    id: z.string().min(1),
    projectId: z.string().min(1),
    updatedAt: z.iso.datetime(),
  })).min(1).max(100),
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('status'), value: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']) }),
    z.strictObject({ type: z.literal('priority'), value: z.enum(['no_priority', 'low', 'medium', 'high', 'urgent']) }),
    z.strictObject({ type: z.literal('assignee'), value: z.string().min(1).nullable() }),
    z.strictObject({ type: z.enum(['add_label', 'remove_label']), value: z.string().min(1) }),
  ]),
});

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

  function normalizeAssigneeId(value: unknown): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

  function emitWorkspaceEvent(
    workspaceId: string,
    type: string,
    payload: Record<string, unknown>,
    actorUserId?: string,
  ) {
    const data = actorUserId
      ? { ...payload, actorUserId }
      : payload;
    broadcastToWorkspace(workspaceId, type, data);
  }

  function sendDependencyError(res: Response, error: unknown, fallback: string) {
    if (error instanceof Error && error.message === TICKET_DEPENDENCY_WORKSPACE_CONFLICT) {
      res.status(409).json({ error: 'Tickets must belong to the same workspace.' });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : fallback });
  }

  async function emitDependencyEvents(
    authorizedWorkspaceId: string,
    source: { id: string; projectId: string } | null,
    sourceProjectId: string,
    other: { id: string; projectId: string } | null,
    otherProjectId: string,
    userId: string,
  ) {
    // Keep ownership stable through the synchronous broadcast. A ticket that
    // moved after hydration gets an invalidation, never its stale snapshot.
    await db.transaction(async (tx) => {
      const projectIds = [...new Set([sourceProjectId, otherProjectId])];
      const scopes = await tx.select({ id: projects.id, workspaceId: projects.workspaceId })
        .from(projects).where(inArray(projects.id, projectIds))
        .orderBy(asc(projects.id)).for('share');
      const ticketIds = [source?.id, other?.id].filter((id): id is string => Boolean(id));
      const currentTickets = ticketIds.length > 0
        ? await tx.select({ id: tickets.id, projectId: tickets.projectId })
          .from(tickets).where(inArray(tickets.id, ticketIds))
          .orderBy(asc(tickets.id)).for('share')
        : [];
      const workspaceByProjectId = new Map(scopes.map((scope) => [scope.id, scope.workspaceId]));
      const currentProjectByTicketId = new Map(currentTickets.map((ticket) => [ticket.id, ticket.projectId]));
      const emitForProject = (snapshot: { id: string; projectId: string } | null, projectId: string) => {
        const workspaceId = workspaceByProjectId.get(projectId);
        if (!workspaceId || workspaceId !== authorizedWorkspaceId) return;
        const currentSnapshot = snapshot && currentProjectByTicketId.get(snapshot.id) === projectId ? snapshot : null;
        emitWorkspaceEvent(workspaceId, 'tickets-updated', currentSnapshot
          ? { projectId, ticketId: currentSnapshot.id, ticket: currentSnapshot }
          : { projectId }, userId);
      };
      emitForProject(source, sourceProjectId);
      if (otherProjectId !== sourceProjectId) emitForProject(other, otherProjectId);
    });
  }

  async function notifyDependencyChange(
    workspaceId: string,
    ticketId: string,
    ticketProjectId: string,
    otherId: string,
    otherProjectId: string,
    userId: string,
  ) {
    try {
      const [ticket, other] = await Promise.all([
        getTicketById(ticketId, ticketProjectId),
        getTicketById(otherId, otherProjectId),
      ]);
      await emitDependencyEvents(workspaceId, ticket, ticketProjectId, other, otherProjectId, userId);
    } catch {
      // The relation already committed. An unavailable realtime path must not
      // turn a successful mutation into an HTTP 500 that clients might retry.
      try { audit('tickets.dependency_realtime_failed', { workspaceId }); } catch { /* best effort */ }
    }
  }

  async function emitRelationshipCleanupEvents(
    relationshipCleanup: Pick<TicketRelationshipCleanupEffect, 'affectedTickets'>,
  ) {
    if (relationshipCleanup.affectedTickets.length === 0) {
      return;
    }

    const affectedTicketSnapshots = await getRelationshipCleanupEventTargets(relationshipCleanup.affectedTickets);

    for (const snapshot of affectedTicketSnapshots) {
      if (!snapshot) {
        continue;
      }

      // The related ticket's updatedAt is unchanged, so tell clients to
      // refetch instead of sending a snapshot rejected by their revision guard.
      // Omitting actorUserId lets the originating client refresh as well.
      emitWorkspaceEvent(snapshot.workspaceId, 'tickets-updated', {
        projectId: snapshot.projectId,
        ticketId: snapshot.ticketId,
        ...(snapshot.ticketKey ? { ticketKey: snapshot.ticketKey } : {}),
        relationshipCleanup: true,
      });
    }
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
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId, userId, workspaceId) => {
      if (!req.body?.title) {
        res.status(400).json({ error: 'Ticket title is required.' });
        return;
      }

      try {
        const assigneeId = normalizeAssigneeId(req.body.assigneeId);
        const created = await createTicketRecord({
          title: req.body.title,
          description: req.body.description,
          status: req.body.status,
          priority: req.body.priority,
          projectId,
          cycleId: req.body.cycleId,
          assigneeId,
          parentId: req.body.parentId,
          labelIds: Array.isArray(req.body.labelIds)
            ? req.body.labelIds.map(String)
            : typeof req.body.labelIds === 'string'
              ? req.body.labelIds.split(',').filter(Boolean)
              : undefined,
        });

        emitWorkspaceEvent(workspaceId, 'tickets-updated', { projectId, ticket: created }, userId);
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof Error && error.message === TICKET_ASSIGNEE_SCOPE_VIOLATION) {
          audit('tickets.assignee_scope_violation', {
            action: 'create_ticket',
            actorUserId: userId,
            projectId,
            workspaceId,
            assigneeId: req.body?.assigneeId,
          });
          res.status(400).json({ error: 'The selected assignee is not part of this workspace.' });
          return;
        }
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

  router.post('/tickets/bulk-triage', async (req, res) => {
    const parsed = bulkTriageSchema.safeParse(req.body);
    if (!parsed.success || new Set(parsed.data.tickets.map((ticket) => ticket.id)).size !== parsed.data.tickets.length) {
      res.status(400).json({ error: 'Provide a valid action and 1–100 distinct ticket snapshots.' });
      return;
    }
    const { workspaceId, tickets: selectedTickets, action } = parsed.data;
    const workspaceAuth = await authorizeWorkspaceAccess(req, workspaceId);
    if (!workspaceAuth.allowed) {
      res.status(workspaceAuth.status).json({ error: workspaceAuth.error });
      return;
    }

    const actionLabel = (action.type === 'add_label' || action.type === 'remove_label')
      ? (await db.select({ id: labels.id, projectId: labels.projectId, teamId: labels.teamId })
          .from(labels).where(eq(labels.id, action.value)).limit(1))[0]
      : null;

    const results: Array<{ id: string; success: boolean; ticket?: Awaited<ReturnType<typeof getTicketById>>; error?: string }> = [];
    for (const selected of selectedTickets) {
      try {
        const current = await getTicketById(selected.id);
        // Never trust the client snapshot as a source of project or workspace authority.
        if (!current || current.projectId !== selected.projectId) {
          results.push({ id: selected.id, success: false, error: 'Ticket changed or is no longer available.' });
          continue;
        }
        const projectAuth = await authorizeProjectAccess(req, current.projectId);
        if (!projectAuth.allowed || projectAuth.workspaceId !== workspaceId) {
          results.push({ id: selected.id, success: false, error: 'Ticket is not available in this workspace.' });
          continue;
        }
        if (action.type === 'add_label' || action.type === 'remove_label') {
          const scope = await getProjectScope(current.projectId);
          const labelAllowed = scope?.workspaceId === workspaceId && actionLabel && (
            scope.hierarchyMode === 'flat'
              ? actionLabel.projectId === current.projectId
              : actionLabel.projectId === null && actionLabel.teamId === scope.teamId
          );
          if (!labelAllowed) {
            results.push({ id: selected.id, success: false, error: 'Label is not available for this project or team.' });
            continue;
          }
        }
        const expectedUpdatedAt = new Date(selected.updatedAt);
        if (new Date(current.updatedAt).getTime() !== expectedUpdatedAt.getTime()) {
          results.push({ id: selected.id, success: false, error: 'Ticket changed. Refresh and retry.' });
          continue;
        }

        const updates = action.type === 'status' ? { status: action.value }
          : action.type === 'priority' ? { priority: action.value }
            : action.type === 'assignee' ? { assigneeId: action.value }
              : { labelIds: action.type === 'add_label'
                ? [...new Set([...(current.labelIds ?? []), action.value])]
                : (current.labelIds ?? []).filter((id) => id !== action.value) };
        const update = await updateTicketRecordWithEffects(selected.id, updates, selected.projectId, expectedUpdatedAt, workspaceId);
        if (!update) {
          results.push({ id: selected.id, success: false, error: 'Ticket changed. Refresh and retry.' });
          continue;
        }
        try {
          emitWorkspaceEvent(workspaceId, 'tickets-updated', { projectId: selected.projectId, ticket: update.ticket }, projectAuth.userId);
          await emitRelationshipCleanupEvents(update.relationshipCleanup);
        } catch {
          try { audit('tickets.bulk_realtime_failed', { workspaceId, ticketId: selected.id }); } catch { /* best effort */ }
        }
        results.push({ id: selected.id, success: true, ticket: update.ticket });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        results.push({ id: selected.id, success: false, error: message === 'TICKET_MOVE_CROSS_WORKSPACE'
          ? 'Ticket is not available in this workspace.'
          : message === TICKET_ASSIGNEE_SCOPE_VIOLATION
          ? 'Assignee is not eligible for this project.'
          : message.includes('labels were not found') ? 'Label is not available for this project or team.'
            : 'Ticket could not be updated. Refresh and retry.' });
      }
    }
    res.json({ results });
  });

  router.patch('/tickets/:ticketId', async (req, res) => {
    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId, userId, workspaceId) => {
      try {
        const assigneeId = normalizeAssigneeId(req.body?.assigneeId);
        const ticketId = normalizeRouteParam(req.params.ticketId);
        const updateResult = await updateTicketRecordWithEffects(ticketId, {
          ...(req.body ?? {}),
          ...(assigneeId !== undefined ? { assigneeId } : {}),
        }, projectId);
        if (!updateResult) {
          res.status(404).json({ error: 'Ticket not found.' });
          return;
        }
        const { ticket: updated, relationshipCleanup, hierarchyChange } = updateResult;
        const eventTicket = updated.projectId !== projectId || hierarchyChange.affectedTickets.length > 0
          ? await getTicketDetails(updated.id, updated.projectId)
          : updated;

        // Cross-project moves stay within the same workspace; one broadcast suffices
        // for the owning workspace but we still send two payloads so the client can
        // refresh both project views.
        emitWorkspaceEvent(workspaceId, 'tickets-updated', { projectId, ticket: eventTicket }, userId);
        if (updated.projectId !== projectId) {
          emitWorkspaceEvent(workspaceId, 'tickets-updated', { projectId: updated.projectId, ticket: eventTicket }, userId);
        }
        await emitRelationshipCleanupEvents({ affectedTickets: [...new Map([
          ...relationshipCleanup.affectedTickets, ...hierarchyChange.affectedTickets,
        ].map(affected => [affected.id, affected])).values()] });
        res.json(updated);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === TICKET_ASSIGNEE_SCOPE_VIOLATION) {
            audit('tickets.assignee_scope_violation', {
              action: 'update_ticket',
              actorUserId: userId,
              ticketId: normalizeRouteParam(req.params.ticketId),
              projectId,
              workspaceId,
              assigneeId: req.body?.assigneeId,
            });
            res.status(400).json({ error: 'The selected assignee is not part of this workspace.' });
            return;
          }
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
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
      try {
        const ticketId = normalizeRouteParam(req.params.ticketId);
        const deleted = await deleteTicketRecordWithEffects(ticketId, ticket.projectId);
        if (!deleted) {
          res.status(404).json({ error: 'Ticket not found.' });
          return;
        }

        emitWorkspaceEvent(workspaceId, 'ticket.deleted', {
          projectId: ticket.projectId,
          ticketId: ticket.id,
          ticketKey: ticket.key,
          deletedTickets: deleted.deletedTickets,
        }, userId);
        res.json({ success: true, deletedTickets: deleted.deletedTickets });
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
        emitWorkspaceEvent(workspaceId, 'comments-updated', {
          ticketId: ticket.id,
          ticketKey: ticket.key,
          comment,
          commentId: comment?.id,
        }, userId);
        res.status(201).json(comment);
      } catch (error) {
        if (error instanceof Error && error.message === COMMENT_BODY_EMPTY_AFTER_SANITIZATION) {
          res.status(400).json({ error: 'Comment body must contain safe content.' });
          return;
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add comment.' });
      }
    });
  });

  router.patch('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
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

        emitWorkspaceEvent(workspaceId, 'comments-updated', {
          ticketId: ticket.id,
          ticketKey: ticket.key,
          comment,
          commentId: comment.id,
        }, userId);
        res.json(comment);
      } catch (error) {
        if (error instanceof Error && error.message === COMMENT_BODY_EMPTY_AFTER_SANITIZATION) {
          res.status(400).json({ error: 'Comment body must contain safe content.' });
          return;
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update comment.' });
      }
    });
  });

  router.delete('/tickets/:ticketId/comments/:commentId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
      try {
        const commentId = normalizeRouteParam(req.params.commentId);
        const deleted = await deleteCommentRecord(commentId, ticket.id);
        if (!deleted) {
          res.status(404).json({ error: 'Comment not found.' });
          return;
        }

        emitWorkspaceEvent(workspaceId, 'comments-updated', {
          ticketId: ticket.id,
          ticketKey: ticket.key,
          commentId,
        }, userId);
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
      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

      if (workspaceId) {
        const auth = await authorizeWorkspaceAccess(req, workspaceId);
        if (!auth.allowed) {
          res.status(auth.status).json({ error: auth.error });
          return;
        }
        const rows = await db.select(labelSelectFields).from(labels)
          .innerJoin(teams, eq(labels.teamId, teams.id))
          .innerJoin(workspaceSettings, eq(workspaceSettings.workspaceId, teams.workspaceId))
          .leftJoin(projects, eq(labels.projectId, projects.id))
          .where(and(eq(teams.workspaceId, workspaceId), or(
            and(eq(workspaceSettings.hierarchyMode, 'teams'), isNull(labels.projectId)),
            and(eq(workspaceSettings.hierarchyMode, 'flat'), eq(projects.workspaceId, workspaceId)),
          )))
          .orderBy(asc(labels.createdAt));
        res.json(rows);
        return;
      }

      if (!teamId && !projectId) {
        res.status(400).json({ error: 'A workspace, team, or project ID is required.' });
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
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket, userId, workspaceId) => {
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

        const updatedTicket = await getTicketById(ticket.id, ticket.projectId);
        emitWorkspaceEvent(workspaceId, 'tickets-updated', {
          projectId: ticket.projectId,
          ticketId: ticket.id,
          ticket: updatedTicket ?? ticket,
        }, userId);

        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to assign label to ticket.' });
      }
    });
  });

  router.delete('/tickets/:id/labels/:labelId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.id), async (ticket, userId, workspaceId) => {
      try {
        const labelId = normalizeRouteParam(req.params.labelId);
        await db
          .delete(ticketLabels)
          .where(and(eq(ticketLabels.ticketId, ticket.id), eq(ticketLabels.labelId, labelId)));

        const updatedTicket = await getTicketById(ticket.id, ticket.projectId);
        emitWorkspaceEvent(workspaceId, 'tickets-updated', {
          projectId: ticket.projectId,
          ticketId: ticket.id,
          ticket: updatedTicket ?? ticket,
        }, userId);

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
        if (projectId) {
          const projectAuth = await authorizeProjectAccess(req, projectId);
          if (!projectAuth.allowed) { res.status(projectAuth.status).json({ error: projectAuth.error }); return; }
          if (projectAuth.workspaceId !== auth.workspaceId || await getProjectTeamId(projectId) !== teamId) {
            res.status(400).json({ error: 'Team does not own this project.' }); return;
          }
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
    try {
      const parsed = createCycleSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid cycle data.', details: parsed.error.issues }); return; }
      const input = parsed.data;
      const projectId = input.projectId ?? getProjectIdFromRequest(req);
      if (!input.teamId && !projectId) { res.status(400).json({ error: 'Either teamId or projectId is required.' }); return; }
      const auth = input.teamId
        ? await authorizeTeamAccess(req, input.teamId)
        : await authorizeProjectAccess(req, projectId!);
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      if (auth.workspaceRole !== 'owner') {
        res.status(403).json({ error: 'Only workspace owners can manage cycles.' }); return;
      }
      const targetTeamId = input.teamId ?? await getProjectTeamId(projectId!);
      if (!targetTeamId) { res.status(404).json({ error: 'Project has no team.' }); return; }
      if (projectId) {
        const projectAuth = await authorizeProjectAccess(req, projectId);
        if (!projectAuth.allowed) { res.status(projectAuth.status).json({ error: projectAuth.error }); return; }
        if (projectAuth.workspaceId !== auth.workspaceId || await getProjectTeamId(projectId) !== targetTeamId) {
          res.status(400).json({ error: 'Team does not own this project.' }); return;
        }
      }
      const cycle = await createCycleRecord(targetTeamId, input, projectId);
      await invalidateSidebarCacheFromTeam(targetTeamId);
      res.status(201).json(mapCycle(cycle));
    } catch (error) {
      res.status(error instanceof CycleError ? error.status : 500).json({ error: error instanceof Error ? error.message : 'Failed to create cycle.' });
    }
  });

  router.get('/cycles/:cycleId', async (req, res) => {
    try {
      const cycle = await getCycleRecord(normalizeRouteParam(req.params.cycleId));
      if (!cycle) { res.status(404).json({ error: 'Cycle not found.' }); return; }
      const auth = await authorizeTeamAccess(req, cycle.teamId);
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      if (req.query.teamId && req.query.teamId !== cycle.teamId) {
        res.status(404).json({ error: 'Cycle not found in this team.' }); return;
      }
      res.json(mapCycle(cycle));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load cycle.' });
    }
  });

  router.patch('/cycles/:cycleId', async (req, res) => {
    try {
      const parsed = editCycleSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid cycle data.', details: parsed.error.issues }); return; }
      const current = await getCycleRecord(normalizeRouteParam(req.params.cycleId));
      if (!current) { res.status(404).json({ error: 'Cycle not found.' }); return; }
      const auth = await authorizeTeamAccess(req, current.teamId);
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      if (auth.workspaceRole !== 'owner') {
        res.status(403).json({ error: 'Only workspace owners can manage cycles.' }); return;
      }
      if (req.query.teamId && req.query.teamId !== current.teamId) {
        res.status(404).json({ error: 'Cycle not found in this team.' }); return;
      }
      const cycle = await editCycleRecord(current.teamId, current.id, parsed.data);
      await invalidateSidebarCacheFromTeam(current.teamId);
      res.json(mapCycle(cycle));
    } catch (error) {
      res.status(error instanceof CycleError ? error.status : 500).json({ error: error instanceof Error ? error.message : 'Failed to update cycle.' });
    }
  });

  async function setCycleCompletion(req: Request, res: Response, completed: boolean) {
    try {
      const current = await getCycleRecord(normalizeRouteParam(req.params.cycleId));
      if (!current) { res.status(404).json({ error: 'Cycle not found.' }); return; }
      const auth = await authorizeTeamAccess(req, current.teamId);
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      if (auth.workspaceRole !== 'owner') {
        res.status(403).json({ error: 'Only workspace owners can manage cycles.' }); return;
      }
      if (req.query.teamId && req.query.teamId !== current.teamId) {
        res.status(404).json({ error: 'Cycle not found in this team.' }); return;
      }
      const cycle = await editCycleRecord(current.teamId, current.id, { completed });
      await invalidateSidebarCacheFromTeam(current.teamId);
      res.json(mapCycle(cycle));
    } catch (error) {
      res.status(error instanceof CycleError ? error.status : 500).json({ error: error instanceof Error ? error.message : 'Failed to change cycle completion.' });
    }
  }

  router.post('/cycles/:cycleId/complete', (req, res) => setCycleCompletion(req, res, true));
  router.post('/cycles/:cycleId/reopen', (req, res) => setCycleCompletion(req, res, false));

  router.delete('/cycles/:cycleId', async (req, res) => {
    try {
      const current = await getCycleRecord(normalizeRouteParam(req.params.cycleId));
      if (!current) { res.status(404).json({ error: 'Cycle not found.' }); return; }
      const auth = await authorizeTeamAccess(req, current.teamId);
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      if (auth.workspaceRole !== 'owner') {
        res.status(403).json({ error: 'Only workspace owners can manage cycles.' }); return;
      }
      if (req.query.teamId && req.query.teamId !== current.teamId) {
        res.status(404).json({ error: 'Cycle not found in this team.' }); return;
      }
      await deleteCycleRecord(current.teamId, current.id);
      await invalidateSidebarCacheFromTeam(current.teamId);
      res.json({ success: true });
    } catch (error) {
      res.status(error instanceof CycleError ? error.status : 500).json({ error: error instanceof Error ? error.message : 'Failed to delete cycle.' });
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
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
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

      if (workspaceId !== depAuth.workspaceId) {
        res.status(409).json({ error: 'Tickets must belong to the same workspace.' });
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
        await createTicketDependencyRelation(ticket.id, dependencyId, ticket.projectId, workspaceId);

        await notifyDependencyChange(workspaceId, ticket.id, ticket.projectId, dependencyId, dependencyTicket.projectId, userId);

        res.status(201).json({ success: true });
      } catch (error) {
        sendDependencyError(res, error, 'Failed to add dependency.');
      }
    });
  });

  router.delete('/tickets/:ticketId/dependencies/:dependencyId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
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

      if (workspaceId !== depAuth.workspaceId) {
        res.status(409).json({ error: 'Tickets must belong to the same workspace.' });
        return;
      }

      if (!(await hasTicketDependencyRelation(ticket.id, dependencyId))) {
        res.status(400).json({ error: 'Ticket is not a dependency of this ticket.' });
        return;
      }

      try {
        await removeTicketDependencyRelation(ticket.id, dependencyId, workspaceId);

        await notifyDependencyChange(workspaceId, ticket.id, ticket.projectId, dependencyId, dependencyTicket.projectId, userId);

        res.json({ success: true });
      } catch (error) {
        sendDependencyError(res, error, 'Failed to remove dependency.');
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
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
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

      if (workspaceId !== blockerAuth.workspaceId) {
        res.status(409).json({ error: 'Tickets must belong to the same workspace.' });
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
        await createTicketDependencyRelation(blockerId, ticket.id, blockerTicket.projectId, workspaceId);

        await notifyDependencyChange(workspaceId, ticket.id, ticket.projectId, blockerId, blockerTicket.projectId, userId);

        res.status(201).json({ success: true });
      } catch (error) {
        sendDependencyError(res, error, 'Failed to add blocker.');
      }
    });
  });

  router.delete('/tickets/:ticketId/blockers/:blockerId', async (req, res) => {
    await withTicketAccess(req, res, normalizeRouteParam(req.params.ticketId), async (ticket, userId, workspaceId) => {
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

      if (workspaceId !== blockerAuth.workspaceId) {
        res.status(409).json({ error: 'Tickets must belong to the same workspace.' });
        return;
      }

      if (!(await hasTicketDependencyRelation(blockerId, ticket.id))) {
        res.status(400).json({ error: 'Ticket is not a blocker of this ticket.' });
        return;
      }

      try {
        await removeTicketDependencyRelation(blockerId, ticket.id, workspaceId);

        await notifyDependencyChange(workspaceId, ticket.id, ticket.projectId, blockerId, blockerTicket.projectId, userId);

        res.json({ success: true });
      } catch (error) {
        sendDependencyError(res, error, 'Failed to remove blocker.');
      }
    });
  });

  return router;
}
