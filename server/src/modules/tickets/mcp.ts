import { asc, eq, and, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { projects, labels, teams, ticketLabels, workspaceSettings } from '../../db/schema.js';
import { audit } from '../../lib/logger.js';
import { mcpEventBus } from '../../lib/mcp-event-bus.js';
import { McpToolValidationError } from '../mcp/errors.js';
import { createWorkspaceScopeViolationError, isWorkspaceScopeViolationError } from '../mcp/scope.js';
import {
  addCommentRecord,
  createTicketRecord,
  createTicketDependencyRelation,
  deleteCommentRecord,
  deleteTicketRecord,
  getTicketById,
  getTicketByKey,
  getTicketDetailsByKey,
  hasCircularDependency,
  hasTicketDependencyRelation,
  listComments,
  listTicketBlockers,
  listTicketDependencies,
  listTickets,
  listWorkspaceTickets,
  removeTicketDependencyRelation,
  updateCommentRecord,
  updateTicketRecord,
  updateTicketRecordWithEffects,
  getProjectScope,
  TICKET_ASSIGNEE_SCOPE_VIOLATION,
} from './services/tickets.js';
import { ToolExecutionContext, ToolHandler } from '../mcp/tool-handlers/types.js';
import { McpToolDefinition } from '../mcp/types.js';

function parseDateArg(value: unknown, fieldName: string): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date format provided for ${fieldName}: ${value}`);
  }
  return d;
}

type WorkspaceTicket = NonNullable<Awaited<ReturnType<typeof getTicketByKey>>>;
type TicketRelationSummary = Awaited<ReturnType<typeof listTicketDependencies>>[number];
type DependencyOperation = 'add' | 'remove';
type DependencyStatus =
  | 'ready'
  | 'missing_input'
  | 'not_found'
  | 'unauthorized'
  | 'self_reference'
  | 'duplicate'
  | 'reverse_duplicate'
  | 'cycle'
  | 'no_relation';
type DependencyTicketSummary = {
  ticketKey: string;
  title: string;
  status: string;
  priority: string;
};
type DependencyRelationshipSummary = {
  blockerTicketKey: string;
  dependentTicketKey: string;
};
type DependencyPreviewResult = {
  ok: boolean;
  operation: string;
  status: DependencyStatus;
  message: string;
  suggestedFix?: string;
  relationship?: DependencyRelationshipSummary;
  existingRelationship?: DependencyRelationshipSummary;
  blockerTicket?: DependencyTicketSummary;
  dependentTicket?: DependencyTicketSummary;
};

function readStringArg(args: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = args[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return '';
}

function formatDependencyTicketForMcp(ticket: TicketRelationSummary) {
  return {
    ticketKey: ticket.key,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
  };
}

/**
 * @description Ticket-focused MCP handlers. Each method re-checks that the
 * target project or ticket belongs to the caller's trusted workspace before
 * touching ticket data.
 */
export class TicketTools {
  private creationRateLimitMap = new Map<string, number>();

  /**
   * @description Lists tickets for a single authorized project or for every
   * project in the caller's workspace.
   * @param args Filter arguments from the MCP tool payload.
   * @param context Trusted tool execution context.
   * @return The matching ticket list for the requested workspace scope.
   * @throws When a requested project falls outside the authorized workspace.
   */
  async listTickets(args: Record<string, unknown>, context: ToolExecutionContext) {
    const explicitProjectId = typeof args.projectId === 'string' ? args.projectId : undefined;
    const filters = {
      status: typeof args.status === 'string' ? args.status : undefined,
      priority: typeof args.priority === 'string' ? args.priority : undefined,
      assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : undefined,
      cycleId: typeof args.cycleId === 'string' ? args.cycleId : undefined,
      labels: typeof args.labels === 'string' ? args.labels.split(',').filter(Boolean) : Array.isArray(args.labels) ? args.labels.map(String) : undefined,
      labelMode: (args.labelMode === 'all' || args.labelMode === 'any' ? args.labelMode : undefined) as 'all' | 'any' | undefined,
    };

    // A single-project query can use the narrower service path; otherwise list the whole workspace.
    if (explicitProjectId) {
      await this.assertProjectInWorkspace(explicitProjectId, context.workspaceId);
      return listTickets(explicitProjectId, filters);
    }

    const validProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, context.workspaceId));
    const projectIds = validProjects.map((project) => project.id);

    return listWorkspaceTickets(projectIds, filters);
  }

  /**
   * @description Loads full ticket details after confirming the ticket belongs
   * to the authorized workspace.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return The expanded ticket details payload.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async getTicketDetails(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const details = await getTicketDetailsByKey(ticketKey);
    if (!details) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }
    return details;
  }

  /**
   * @description Loads fully resolved ticket details (status, priority, assignee, project, domain, cycle)
   * after confirming the ticket belongs to the authorized workspace.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return The fully resolved ticket details payload.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async readTicketDetails(args: Record<string, unknown>, context: ToolExecutionContext) {
    // Both call getTicketDetailsByKey under the hood, which has been enhanced to resolve all required nested objects.
    return this.getTicketDetails(args, context);
  }

  /**
   * @description Creates a ticket inside a project already verified to belong
   * to the authorized workspace.
   * @param args Tool arguments for the new ticket.
   * @param context Trusted tool execution context.
   * @return The newly created ticket wrapper.
   * @throws When the target project is outside the authorized workspace.
   */
  async createTicket(args: Record<string, unknown>, context: ToolExecutionContext) {
    const now = Date.now();
    const lastCreationTime = this.creationRateLimitMap.get(context.actorUserId) ?? 0;

    if (process.env.NODE_ENV !== 'test' && now - lastCreationTime < 3000) {
      throw new Error('Rate limit exceeded: You can only create one ticket every 3 seconds from this server instance. Please wait a moment and try again.');
    }

    this.creationRateLimitMap.set(context.actorUserId, now);

    const projectId = String(args.projectId ?? '');
    await this.assertProjectInWorkspace(projectId, context.workspaceId);

    let ticket;
    try {
      ticket = await createTicketRecord({
        title: String(args.title ?? ''),
        description: typeof args.description === 'string' ? args.description : '',
        status: typeof args.status === 'string' ? args.status : 'todo',
        priority: typeof args.priority === 'string' ? args.priority : 'no_priority',
        projectId,
        cycleId: typeof args.cycleId === 'string' ? args.cycleId : null,
        assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : null,
        parentId: typeof args.parentId === 'string' ? args.parentId : null,
        labelIds: typeof args.labels === 'string' ? args.labels.split(',').filter(Boolean) : Array.isArray(args.labels) ? args.labels.map(String) : Array.isArray(args.labelIds) ? args.labelIds.map(String) : undefined,
        createdAt: parseDateArg(args.createdAt, 'createdAt'),
        updatedAt: parseDateArg(args.updatedAt, 'updatedAt'),
      });
    } catch (error) {
      if (error instanceof Error && error.message === TICKET_ASSIGNEE_SCOPE_VIOLATION) {
        audit('mcp.tickets.assignee_scope_violation', {
          action: 'create_ticket',
          actorUserId: context.actorUserId,
          workspaceId: context.workspaceId,
          projectId,
          assigneeId: args.assigneeId,
        });
        throw new McpToolValidationError('The selected assignee is not part of this workspace.');
      }

      throw error;
    }

    // Emit SSE event so connected clients refresh immediately.
    const scope = await getProjectScope(projectId);
    if (scope) {
      const baseEvent = {
        workspaceId: scope.workspaceId,
        projectId,
        teamId: scope.teamId,
        ticketKey: ticket.key,
        actorUserId: context.actorUserId,
        timestamp: new Date().toISOString(),
      };

      mcpEventBus.publish({
        ...baseEvent,
        type: 'ticket.created',
        data: { ticket },
      });

      if (ticket.parentId) {
        mcpEventBus.publish({
          ...baseEvent,
          type: 'subtask.created',
          data: { parentId: ticket.parentId },
        });
      }
    }

    return { ticket };
  }

  /**
   * @description Deletes a ticket after validating ownership for the authorized
   * workspace.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return Deletion result wrapper.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async deleteTicket(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const deleted = await deleteTicketRecord(ticket.id, ticket.projectId);
    if (!deleted) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    const scope = await getProjectScope(ticket.projectId);
    if (!scope) {
      throw new Error(`Project ${ticket.projectId} not found.`);
    }

    mcpEventBus.publish({
        type: 'ticket.deleted',
        workspaceId: scope.workspaceId,
        projectId: ticket.projectId,
        teamId: scope.teamId,
        ticketKey,
        actorUserId: context.actorUserId,
        timestamp: new Date().toISOString(),
        data: { ticketId: ticket.id, ticket },
      });

    return { success: true };
  }

  /**
   * @description Updates a ticket after validating that its project belongs to
   * the authorized workspace.
   * @param args Tool arguments containing the ticket key and patch values.
   * @param context Trusted tool execution context.
   * @return The updated ticket wrapper.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async updateTicket(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const createdAt = parseDateArg(args.createdAt, 'createdAt');
    const updatedAt = parseDateArg(args.updatedAt, 'updatedAt');

    let updateResult;
    try {
      updateResult = await updateTicketRecordWithEffects(
        ticket.id,
        {
          ...(typeof args.title === 'string' ? { title: args.title } : {}),
          ...(typeof args.description === 'string' ? { description: args.description } : {}),
          ...(typeof args.status === 'string' ? { status: args.status } : {}),
          ...(typeof args.priority === 'string' ? { priority: args.priority } : {}),
          ...(typeof args.assigneeId === 'string' ? { assigneeId: args.assigneeId } : {}),
          ...(typeof args.cycleId === 'string' ? { cycleId: args.cycleId } : {}),
          ...(typeof args.parentId === 'string' ? { parentId: args.parentId } : {}),
          ...(typeof args.prStatus === 'string' ? { prStatus: args.prStatus } : {}),
          ...(typeof args.prUrl === 'string' ? { prUrl: args.prUrl } : {}),
          ...(typeof args.labels === 'string' ? { labelIds: args.labels.split(',').filter(Boolean) } : Array.isArray(args.labels) ? { labelIds: args.labels.map(String) } : Array.isArray(args.labelIds) ? { labelIds: args.labelIds.map(String) } : {}),
          ...(createdAt ? { createdAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
        },
        ticket.projectId,
      );
    } catch (error) {
      if (error instanceof Error && error.message === TICKET_ASSIGNEE_SCOPE_VIOLATION) {
        audit('mcp.tickets.assignee_scope_violation', {
          action: 'update_ticket',
          actorUserId: context.actorUserId,
          workspaceId: context.workspaceId,
          ticketId: ticket.id,
          ticketKey,
          assigneeId: args.assigneeId,
        });
        throw new McpToolValidationError('The selected assignee is not part of this workspace.');
      }

      throw error;
    }
    const updated = updateResult?.ticket ?? null;

    const scope = await getProjectScope(ticket.projectId);
    if (scope) {
      mcpEventBus.publish({
        type: 'ticket.updated',
        workspaceId: scope.workspaceId,
        projectId: ticket.projectId,
        teamId: scope.teamId,
        ticketKey,
        actorUserId: context.actorUserId,
        timestamp: new Date().toISOString(),
        data: { ticket: updated },
      });
    }

    if (updateResult?.relationshipCleanup.affectedTickets.length) {
      const relatedTicketEvents = await Promise.all(
        updateResult.relationshipCleanup.affectedTickets.map(async ({ id, projectId }) => {
          const [relatedTicket, relatedScope] = await Promise.all([
            getTicketById(id, projectId),
            getProjectScope(projectId),
          ]);

          if (!relatedTicket || !relatedScope || relatedScope.workspaceId !== context.workspaceId) {
            return null;
          }

          return {
            scope: relatedScope,
            ticket: relatedTicket,
          };
        }),
      );

      for (const event of relatedTicketEvents) {
        if (!event) {
          continue;
        }

        mcpEventBus.publish({
          type: 'ticket.updated',
          workspaceId: event.scope.workspaceId,
          projectId: event.ticket.projectId,
          teamId: event.scope.teamId,
          ticketKey: event.ticket.key,
          actorUserId: context.actorUserId,
          timestamp: new Date().toISOString(),
          data: { ticket: event.ticket },
        });
      }
    }

    return { ticket: updated };
  }

  /**
   * @description Adds a dependency link so the source ticket blocks the provided
   * dependency ticket.
   * @param args Tool arguments containing both ticket keys.
   * @param context Trusted tool execution context.
   * @return Success wrapper.
   * @throws When either ticket is missing, cross-workspace, or creates an invalid relation.
   */
  async addDependency(args: Record<string, unknown>, context: ToolExecutionContext) {
    return this.markTicketBlocked(args, context, 'add_dependency');
  }

  /**
   * @description Removes an existing dependency link from ticket to dependency ticket.
   * @param args Tool arguments containing both ticket keys.
   * @param context Trusted tool execution context.
   * @return Success wrapper.
   * @throws When either ticket is missing, cross-workspace, or relation does not exist.
   */
  async removeDependency(args: Record<string, unknown>, context: ToolExecutionContext) {
    return this.unmarkTicketBlocked(args, context, 'remove_dependency');
  }

  /**
   * @description Marks a ticket as blocked by another ticket using the
   * blocker/dependency terminology that agents can reason about directly.
   * @param args Tool arguments containing blocker and dependent ticket keys.
   * @param context Trusted tool execution context.
   * @param auditAction Audit event label for the caller-facing alias.
   * @return Success wrapper with the created blocker relationship.
   * @throws When the relationship cannot be created safely.
   */
  async markTicketBlocked(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    auditAction = 'mark_ticket_blocked',
  ) {
    const preview = await this.analyzeDependencyMutation('add', args, context.workspaceId);

    if (!preview.ok || !preview.relationship || !preview.blockerTicket || !preview.dependentTicket) {
      throw new McpToolValidationError(preview.message, preview);
    }

    const blockerTicket = await this.getTicketByKeyInWorkspace(
      preview.relationship.blockerTicketKey,
      context.workspaceId,
      'Blocker ticket',
    );
    const dependentTicket = await this.getTicketByKeyInWorkspace(
      preview.relationship.dependentTicketKey,
      context.workspaceId,
      'Dependent ticket',
    );
    const scope = await getProjectScope(blockerTicket.projectId);
    if (!scope) {
      throw new Error(`Project ${blockerTicket.projectId} not found.`);
    }

    await createTicketDependencyRelation(blockerTicket.id, dependentTicket.id, blockerTicket.projectId);

    audit(auditAction, {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      blockerTicketKey: blockerTicket.key,
      dependentTicketKey: dependentTicket.key,
    });

    mcpEventBus.publish({
      type: 'dependency.added',
      workspaceId: scope.workspaceId,
      projectId: blockerTicket.projectId,
      teamId: scope.teamId,
      ticketKey: blockerTicket.key,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: {
        dependencyTicketKey: dependentTicket.key,
        blockerTicketKey: blockerTicket.key,
        dependentTicketKey: dependentTicket.key,
      },
    });

    return {
      success: true,
      relationship: preview.relationship,
      message: `${blockerTicket.key} now blocks ${dependentTicket.key}.`,
    };
  }

  /**
   * @description Removes a blocker/dependency relationship between two tickets.
   * @param args Tool arguments containing blocker and dependent ticket keys.
   * @param context Trusted tool execution context.
   * @param auditAction Audit event label for the caller-facing alias.
   * @return Success wrapper with the removed blocker relationship.
   * @throws When the relationship cannot be removed safely.
   */
  async unmarkTicketBlocked(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    auditAction = 'unmark_ticket_blocked',
  ) {
    const preview = await this.analyzeDependencyMutation('remove', args, context.workspaceId);

    if (!preview.ok || !preview.relationship || !preview.blockerTicket || !preview.dependentTicket) {
      throw new McpToolValidationError(preview.message, preview);
    }

    const blockerTicket = await this.getTicketByKeyInWorkspace(
      preview.relationship.blockerTicketKey,
      context.workspaceId,
      'Blocker ticket',
    );
    const dependentTicket = await this.getTicketByKeyInWorkspace(
      preview.relationship.dependentTicketKey,
      context.workspaceId,
      'Dependent ticket',
    );
    const scope = await getProjectScope(blockerTicket.projectId);
    if (!scope) {
      throw new Error(`Project ${blockerTicket.projectId} not found.`);
    }

    await removeTicketDependencyRelation(blockerTicket.id, dependentTicket.id);

    audit(auditAction, {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      blockerTicketKey: blockerTicket.key,
      dependentTicketKey: dependentTicket.key,
    });

    mcpEventBus.publish({
      type: 'dependency.removed',
      workspaceId: scope.workspaceId,
      projectId: blockerTicket.projectId,
      teamId: scope.teamId,
      ticketKey: blockerTicket.key,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: {
        dependencyTicketKey: dependentTicket.key,
        blockerTicketKey: blockerTicket.key,
        dependentTicketKey: dependentTicket.key,
      },
    });

    return {
      success: true,
      relationship: preview.relationship,
      message: `${blockerTicket.key} no longer blocks ${dependentTicket.key}.`,
    };
  }

  /**
   * @description Returns a structured preflight analysis for adding or
   * removing a blocker/dependency relationship without mutating any data.
   * @param args Tool arguments containing the operation and ticket keys.
   * @param context Trusted tool execution context.
   * @return A structured preview with validation hints and suggested fixes.
   */
  async previewTicketDependency(args: Record<string, unknown>, context: ToolExecutionContext) {
    return this.analyzeDependencyMutation(String(args.operation ?? '').toLowerCase().trim(), args, context.workspaceId);
  }

  private async lookupDependencyTicket(
    ticketKey: string,
    workspaceId: string,
    operation: DependencyOperation,
    role: 'blocker' | 'dependent',
    relationship?: DependencyRelationshipSummary,
  ): Promise<{ ticket?: WorkspaceTicket; failure?: DependencyPreviewResult }> {
    const label = role === 'blocker' ? 'Blocker ticket' : 'Dependent ticket';

    try {
      const ticket = await this.getTicketByKeyInWorkspace(ticketKey, workspaceId, label);
      return { ticket };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resolve ticket.';
      const normalized = message.toLowerCase();

      if (normalized.includes('not found')) {
        return {
          failure: {
            ok: false,
            operation,
            status: 'not_found',
            message,
            suggestedFix: `Check the ${role} ticket key and use a human-readable key like GRAV-123.`,
            relationship,
          },
        };
      }

      if (isWorkspaceScopeViolationError(error) || normalized.includes('unauthorized') || normalized.includes('workspace mismatch')) {
        const scopeError = await createWorkspaceScopeViolationError(workspaceId, {
          action: 'preview_ticket_dependency',
          operation,
          role,
          ticketKey,
        });

        return {
          failure: {
            ok: false,
            operation,
            status: 'unauthorized',
            message: scopeError.message,
            suggestedFix: 'Use tickets from the current workspace, or switch to the correct workspace first.',
            relationship,
          },
        };
      }

      return {
        failure: {
          ok: false,
          operation,
          status: 'not_found',
          message,
          suggestedFix: 'Double-check the ticket key and try again.',
          relationship,
        },
      };
    }
  }

  private async analyzeDependencyMutation(
    operation: DependencyOperation | string,
    args: Record<string, unknown>,
    workspaceId: string,
  ): Promise<DependencyPreviewResult> {
    const blockerTicketKey = readStringArg(args, [
      'blocker_ticket_key',
      'blockerTicketKey',
      'ticketKey',
      'ticket_key',
    ]).toUpperCase();
    const dependentTicketKey = readStringArg(args, [
      'dependent_ticket_key',
      'dependentTicketKey',
      'dependency_ticket_key',
      'dependencyTicketKey',
      'dependencyKey',
    ]).toUpperCase();
    const relationship = blockerTicketKey && dependentTicketKey
      ? { blockerTicketKey, dependentTicketKey }
      : undefined;

    const fail = (
      status: DependencyStatus,
      message: string,
      suggestedFix: string,
      extra: Partial<DependencyPreviewResult> = {},
    ): DependencyPreviewResult => ({
      ok: false,
      operation,
      status,
      message,
      suggestedFix,
      relationship,
      ...extra,
    });

    if (operation !== 'add' && operation !== 'remove') {
      return fail('missing_input', 'Unsupported dependency preview operation.', 'Use operation="add" or operation="remove".');
    }

    if (!blockerTicketKey || !dependentTicketKey) {
      return fail(
        'missing_input',
        'blocker_ticket_key and dependent_ticket_key are required.',
        'Provide both human-readable ticket keys like GRAV-123 and GRAV-456.',
      );
    }

    if (blockerTicketKey === dependentTicketKey) {
      return fail(
        'self_reference',
        'A ticket cannot block or depend on itself.',
        'Choose two different tickets for the blocker and dependent.',
      );
    }

    const blockerLookup = await this.lookupDependencyTicket(blockerTicketKey, workspaceId, operation, 'blocker', relationship);
    if (blockerLookup.failure) {
      return blockerLookup.failure;
    }

    const dependentLookup = await this.lookupDependencyTicket(dependentTicketKey, workspaceId, operation, 'dependent', relationship);
    if (dependentLookup.failure) {
      return dependentLookup.failure;
    }

    const blockerTicket = blockerLookup.ticket!;
    const dependentTicket = dependentLookup.ticket!;
    const blockerSummary = formatDependencyTicketForMcp(blockerTicket);
    const dependentSummary = formatDependencyTicketForMcp(dependentTicket);

    if (operation === 'add') {
      if (await hasTicketDependencyRelation(blockerTicket.id, dependentTicket.id)) {
        return fail(
          'duplicate',
          `${blockerTicket.key} already blocks ${dependentTicket.key}.`,
          'Use unmark_ticket_blocked to remove the existing blocker/dependency relationship before adding it again.',
          {
            blockerTicket: blockerSummary,
            dependentTicket: dependentSummary,
            existingRelationship: relationship ?? {
              blockerTicketKey: blockerTicket.key,
              dependentTicketKey: dependentTicket.key,
            },
          },
        );
      }

      if (await hasTicketDependencyRelation(dependentTicket.id, blockerTicket.id)) {
        return fail(
          'reverse_duplicate',
          `${dependentTicket.key} already blocks ${blockerTicket.key}.`,
          `Remove ${dependentTicket.key} -> ${blockerTicket.key} first, or swap the keys if that was the intent.`,
          {
            blockerTicket: blockerSummary,
            dependentTicket: dependentSummary,
            existingRelationship: {
              blockerTicketKey: dependentTicket.key,
              dependentTicketKey: blockerTicket.key,
            },
          },
        );
      }

      if (await hasCircularDependency(dependentTicket.id, blockerTicket.id)) {
        return fail(
          'cycle',
          `Adding ${blockerTicket.key} -> ${dependentTicket.key} would create a circular dependency.`,
          'Choose a different blocker or remove the downstream dependency chain before adding this relationship.',
          {
            blockerTicket: blockerSummary,
            dependentTicket: dependentSummary,
          },
        );
      }

      return {
        ok: true,
        operation,
        status: 'ready',
        message: `${blockerTicket.key} can block ${dependentTicket.key}.`,
        relationship,
        blockerTicket: blockerSummary,
        dependentTicket: dependentSummary,
      };
    }

    if (await hasTicketDependencyRelation(blockerTicket.id, dependentTicket.id)) {
      return {
        ok: true,
        operation,
        status: 'ready',
        message: `${blockerTicket.key} blocks ${dependentTicket.key} and can be removed.`,
        relationship,
        blockerTicket: blockerSummary,
        dependentTicket: dependentSummary,
      };
    }

    if (await hasTicketDependencyRelation(dependentTicket.id, blockerTicket.id)) {
      return {
        ok: true,
        operation,
        status: 'ready',
        message: `${dependentTicket.key} blocks ${blockerTicket.key} and can be removed.`,
        relationship: {
          blockerTicketKey: dependentTicket.key,
          dependentTicketKey: blockerTicket.key,
        },
        blockerTicket: dependentSummary,
        dependentTicket: blockerSummary,
      };
    }

    return fail(
      'no_relation',
      `No dependency relationship exists between ${blockerTicket.key} and ${dependentTicket.key}.`,
      'Use preview_ticket_dependency with operation="add" if you want to create the relationship instead.',
      {
        blockerTicket: blockerSummary,
        dependentTicket: dependentSummary,
      },
    );
  }

  /**
   * @description Lists both blockers and dependents for a ticket using
   * human-readable ticket keys so AI agents can reason about blocked-by and
   * blocks relationships directly.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return Blocked-by and blocks summaries for the requested ticket.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async listTicketDependencyRelations(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = readStringArg(args, ['ticket_key', 'ticketKey']).toUpperCase();
    if (!ticketKey) {
      throw new Error('ticket_key is required for list_ticket_dependencies.');
    }

    const ticket = await this.getTicketByKeyInWorkspace(ticketKey, context.workspaceId, 'Ticket');
    const [blockedBy, blocks] = await Promise.all([
      listTicketBlockers(ticket.id),
      listTicketDependencies(ticket.id),
    ]);

    return {
      ticketKey: ticket.key,
      blockedBy: blockedBy.map(formatDependencyTicketForMcp),
      blocks: blocks.map(formatDependencyTicketForMcp),
    };
  }

  /**
   * @description Creates a ticket comment using the trusted actor identity from
   * the execution context.
   * @param args Tool arguments containing the ticket key and comment body.
   * @param context Trusted tool execution context.
   * @return The newly created comment wrapper.
   * @throws When the ticket is unavailable, the actor is missing, or the body is empty.
   */
  async createComment(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    // Comment authorship always comes from the trusted actor context, not request args.
    const userId = context.actorUserId;
    const body = String(args.body ?? '');

    if (!userId) {
      throw new Error('Authenticated user is required to add a comment.');
    }

    if (!body) {
      throw new Error('body is required to add a comment.');
    }

    const createdAt = parseDateArg(args.createdAt, 'createdAt');
    const comment = await addCommentRecord(ticket.id, userId, body, createdAt);

    const scope = await getProjectScope(ticket.projectId);
    if (scope) {
      mcpEventBus.publish({
        type: 'comment.added',
        workspaceId: scope.workspaceId,
        projectId: ticket.projectId,
        teamId: scope.teamId,
        ticketKey: ticket.key,
        actorUserId: context.actorUserId,
        timestamp: new Date().toISOString(),
        data: {
          comment,
          commentId: comment?.id,
          ticketId: ticket.id,
          ticketKey: ticket.key,
        },
      });
    }

    return { comment };
  }

  /**
   * @description Reads all comments for a ticket already verified to belong to
   * the authorized workspace.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return The comment collection wrapper.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async readComments(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const comments = await listComments(ticket.id);
    return { comments };
  }

  /**
   * @description Deletes a ticket comment after validating the ticket scope.
   * @param args Tool arguments containing the ticket key and comment id.
   * @param context Trusted tool execution context.
   * @return The deletion success wrapper.
   * @throws When the ticket is unavailable, outside the workspace, or the comment id is missing.
   */
  async deleteComment(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const commentId = String(args.commentId ?? '');

    if (!commentId) {
      throw new Error('commentId is required for delete_comment.');
    }

    const success = await deleteCommentRecord(commentId, ticket.id);

    if (success) {
      const scope = await getProjectScope(ticket.projectId);
      if (scope) {
        mcpEventBus.publish({
          type: 'comment.deleted',
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey: ticket.key,
          actorUserId: context.actorUserId,
          timestamp: new Date().toISOString(),
          data: {
            commentId,
            ticketId: ticket.id,
            ticketKey: ticket.key,
          },
        });
      }
    }

    return { success };
  }

  /**
   * @description Updates a ticket comment after validating the ticket scope.
   * @param args Tool arguments containing the ticket key, comment id, and body.
   * @param context Trusted tool execution context.
   * @return The updated comment wrapper.
   * @throws When the ticket is unavailable, outside the workspace, or required fields are missing.
   */
  async updateComment(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const commentId = String(args.commentId ?? '');
    const body = String(args.body ?? '');

    if (!commentId || !body) {
      throw new Error('commentId and body are required for update_comment.');
    }

    const comment = await updateCommentRecord(commentId, ticket.id, body);

    if (comment) {
      const scope = await getProjectScope(ticket.projectId);
      if (scope) {
        mcpEventBus.publish({
          type: 'comment.updated',
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey: ticket.key,
          actorUserId: context.actorUserId,
          timestamp: new Date().toISOString(),
          data: {
            comment,
            commentId: comment.id,
            ticketId: ticket.id,
            ticketKey: ticket.key,
          },
        });
      }
    }

    return { comment };
  }

  /**
   * @description Reads all labels currently assigned to a specific ticket.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return An array of label objects (name, color, description) assigned to the ticket.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async getTicketLabels(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    // getTicketByKey does not join label rows — query directly.
    const rows = await db
      .select({
        name: labels.name,
        color: labels.color,
        description: labels.description,
      })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticket.id))
      .orderBy(asc(labels.sortOrder), asc(labels.name));

    return { labels: rows };
  }

  /**
   * @description Adds one or more labels to a ticket without removing existing ones.
   * Duplicate labels are silently skipped.
   * @param args Tool arguments containing the ticket key and label names to add.
   * @param context Trusted tool execution context.
   * @return Confirmation with the updated full list of labels on the ticket.
   * @throws When the ticket does not exist, belongs to another workspace, or any
   *   specified label does not exist in the project/team scope.
   */
  async addTicketLabels(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const labelsToAdd = typeof args.labels === 'string'
      ? args.labels.split(',').map(s => s.trim()).filter(Boolean)
      : Array.isArray(args.labels)
        ? args.labels.map(String)
        : [];

    if (labelsToAdd.length === 0) {
      // Nothing to add — return current labels.
      const current = await db
        .select({ name: labels.name, color: labels.color, description: labels.description })
        .from(ticketLabels)
        .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
        .where(eq(ticketLabels.ticketId, ticket.id))
        .orderBy(asc(labels.sortOrder), asc(labels.name));
      return { labels: current };
    }

    const projectScope = await getProjectScope(ticket.projectId);
    if (!projectScope) {
      throw new Error(`Project ${ticket.projectId} not found.`);
    }
    const scopeLabel = projectScope.hierarchyMode === 'flat' ? 'project' : 'team';

    // Resolve requested label names to IDs within the correct scope.
    const resolvedNew = await db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(
        projectScope.hierarchyMode === 'flat'
          ? and(eq(labels.projectId, ticket.projectId), inArray(labels.name, labelsToAdd))
          : and(eq(labels.teamId, projectScope.teamId), isNull(labels.projectId), inArray(labels.name, labelsToAdd)),
      );

    if (resolvedNew.length !== labelsToAdd.length) {
      const foundNames = new Set(resolvedNew.map(l => l.name));
      const missing = labelsToAdd.filter(n => !foundNames.has(n));
      throw new Error(
        `The following labels do not exist in this ${scopeLabel}: ${missing.join(', ')}. ` +
        `Use list_workspace_labels to see available labels.`,
      );
    }

    // Fetch IDs already on the ticket so we avoid inserting duplicates.
    const existingRows = await db
      .select({ labelId: ticketLabels.labelId })
      .from(ticketLabels)
      .where(eq(ticketLabels.ticketId, ticket.id));
    const existingLabelIds = new Set(existingRows.map(r => r.labelId));

    const newEntries = resolvedNew
      .filter(l => !existingLabelIds.has(l.id))
      .map(l => ({ ticketId: ticket.id, labelId: l.id }));

    if (newEntries.length > 0) {
      await db.insert(ticketLabels).values(newEntries).onConflictDoNothing();
    }

    // Return the full updated label list.
    const updated = await db
      .select({ name: labels.name, color: labels.color, description: labels.description })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticket.id))
      .orderBy(asc(labels.sortOrder), asc(labels.name));

    audit('add_ticket_labels', {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      ticketKey,
      addedLabels: labelsToAdd,
      finalLabels: updated.map(l => l.name),
    });

    mcpEventBus.publish({
      type: 'labels.added',
      workspaceId: context.workspaceId,
      projectId: ticket.projectId,
      teamId: projectScope.teamId,
      ticketKey,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: { addedLabels: labelsToAdd, finalLabels: updated.map(l => l.name) },
    });

    return { labels: updated };
  }

  /**
   * @description Lists all labels available in the authorized workspace.
   * Scopes the query to the workspace resolved from the trusted context;
   * an optional projectId narrows results further.
   * @param args Tool arguments optionally containing a projectId.
   * @param context Trusted tool execution context.
   * @return An array of label objects available in the workspace/project.
   */
  async listWorkspaceLabels(args: Record<string, unknown>, context: ToolExecutionContext) {
    const explicitProjectId = typeof args.projectId === 'string' && args.projectId.trim().length > 0
      ? args.projectId.trim()
      : undefined;

    if (explicitProjectId) {
      // Validate the project belongs to the authorized workspace.
      await this.assertProjectInWorkspace(explicitProjectId, context.workspaceId);

      const rows = await db
        .select({
          name: labels.name,
          color: labels.color,
          description: labels.description,
          projectId: labels.projectId,
        })
        .from(labels)
        .where(eq(labels.projectId, explicitProjectId))
        .orderBy(asc(labels.sortOrder), asc(labels.name));

      return { labels: rows.map(r => ({ name: r.name, color: r.color, description: r.description, projectId: r.projectId ?? undefined })) };
    }

    // No explicit project — return all labels scoped to the workspace via team membership.
    const rows = await db
      .select({
        name: labels.name,
        color: labels.color,
        description: labels.description,
        teamId: labels.teamId,
        projectId: labels.projectId,
      })
      .from(labels)
      .innerJoin(teams, eq(teams.id, labels.teamId))
      .where(eq(teams.workspaceId, context.workspaceId))
      .orderBy(asc(labels.sortOrder), asc(labels.name));

    return {
      labels: rows.map(r => ({
        name: r.name,
        color: r.color,
        description: r.description,
        ...(r.projectId ? { projectId: r.projectId } : { teamId: r.teamId }),
      })),
    };
  }

  /**
   * @description Removes one or more labels from a ticket by name.
   * Specified labels not present on the ticket are silently skipped.
   * @param args Tool arguments containing the ticket key and label names to remove.
   * @param context Trusted tool execution context.
   * @return The updated list of label objects on the ticket.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async removeTicketLabels(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const labelsToRemove = typeof args.labels === 'string'
      ? args.labels.split(',').map(s => s.trim()).filter(Boolean)
      : Array.isArray(args.labels)
        ? args.labels.map(String)
        : [];

    // getTicketByKey does not join label rows — query the current label set directly.
    const currentLabelRows = await db
      .select({ id: labels.id, name: labels.name })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticket.id));

    if (labelsToRemove.length === 0) {
      const full = await db
        .select({ name: labels.name, color: labels.color, description: labels.description })
        .from(ticketLabels)
        .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
        .where(eq(ticketLabels.ticketId, ticket.id))
        .orderBy(asc(labels.sortOrder), asc(labels.name));
      return { labels: full };
    }

    const namesToRemoveSet = new Set(labelsToRemove);
    const newLabelNames = currentLabelRows.map(l => l.name).filter(name => !namesToRemoveSet.has(name));

    const projectScope = await getProjectScope(ticket.projectId);
    if (!projectScope) {
      throw new Error(`Project ${ticket.projectId} not found.`);
    }

    const resolvedLabels = newLabelNames.length > 0
      ? await db.select({ id: labels.id, name: labels.name }).from(labels).where(
        projectScope.hierarchyMode === 'flat'
          ? and(eq(labels.projectId, ticket.projectId), inArray(labels.name, newLabelNames))
          : and(eq(labels.teamId, projectScope.teamId), isNull(labels.projectId), inArray(labels.name, newLabelNames)),
      )
      : [];

    const labelIds = resolvedLabels.map(l => l.id);
    await updateTicketRecord(ticket.id, { labelIds }, ticket.projectId);

    audit('remove_ticket_labels', {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      ticketKey,
      removedLabels: labelsToRemove,
      finalLabels: newLabelNames,
    });

    mcpEventBus.publish({
      type: 'labels.removed',
      workspaceId: projectScope.workspaceId,
      projectId: ticket.projectId,
      teamId: projectScope.teamId,
      ticketKey,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: { removedLabels: labelsToRemove, finalLabels: newLabelNames },
    });

    // Return the full updated label list as rich objects.
    const updated = await db
      .select({ name: labels.name, color: labels.color, description: labels.description })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticket.id))
      .orderBy(asc(labels.sortOrder), asc(labels.name));

    return { labels: updated };
  }

  /**
   * @description Replaces all labels on a ticket with a new set of label names.
   * @param args Tool arguments containing the ticket key and the new label names.
   * @param context Trusted tool execution context.
   * @return The updated list of label names on the ticket.
   * @throws When the ticket does not exist, belongs to another workspace, or label resolution fails.
   */
  async setTicketLabels(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const labelNames = typeof args.labels === 'string'
      ? args.labels.split(',').map(s => s.trim()).filter(Boolean)
      : Array.isArray(args.labels)
        ? args.labels.map(String)
        : [];

    const projectScope = await getProjectScope(ticket.projectId);
    if (!projectScope) {
      throw new Error(`Project ${ticket.projectId} not found.`);
    }
    const scopeLabel = projectScope.hierarchyMode === 'flat' ? 'project' : 'team';

    const resolvedLabels = labelNames.length > 0
      ? await db.select({ id: labels.id, name: labels.name }).from(labels).where(
        projectScope.hierarchyMode === 'flat'
          ? and(eq(labels.projectId, ticket.projectId), inArray(labels.name, labelNames))
          : and(eq(labels.teamId, projectScope.teamId), isNull(labels.projectId), inArray(labels.name, labelNames)),
      )
      : [];

    if (resolvedLabels.length !== labelNames.length) {
      const foundNames = new Set(resolvedLabels.map(l => l.name));
      const missing = labelNames.filter(n => !foundNames.has(n));
      throw new Error(`The following labels do not exist in this ${scopeLabel}: ${missing.join(', ')}`);
    }

    const labelIds = resolvedLabels.map(l => l.id);
    await updateTicketRecord(ticket.id, { labelIds }, ticket.projectId);

    audit('set_ticket_labels', {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      ticketKey,
      newLabels: labelNames,
    });

    mcpEventBus.publish({
      type: 'labels.set',
      workspaceId: projectScope.workspaceId,
      projectId: ticket.projectId,
      teamId: projectScope.teamId,
      ticketKey,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: { labels: labelNames },
    });

    // Return the full updated label list as rich objects.
    const updatedRows = await db
      .select({ name: labels.name, color: labels.color, description: labels.description })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticket.id))
      .orderBy(asc(labels.sortOrder), asc(labels.name));

    return { labels: updatedRows };
  }

  /**
   * @description Resolves a ticket by key and rejects cross-workspace access
   * before the caller can read or mutate related ticket data.
   * @param args Tool arguments containing the ticket key.
   * @param workspaceId Authorized workspace id.
   * @return The resolved ticket record.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  private async getTicketInWorkspace(args: Record<string, unknown>, workspaceId: string) {
    const ticketKey = readStringArg(args, ['ticketKey', 'ticket_key']).toUpperCase();
    if (!ticketKey) {
      throw new Error('ticketKey is required.');
    }

    return this.getTicketByKeyInWorkspace(ticketKey, workspaceId, 'Ticket');
  }

  private async getTicketByKeyInWorkspace(ticketKey: string, workspaceId: string, label: string): Promise<WorkspaceTicket> {
    const ticket = await getTicketByKey(ticketKey);

    if (!ticket) {
      throw new Error(`${label} ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, workspaceId);
    return ticket;
  }

  private async resolveDependencyAddition(args: Record<string, unknown>, workspaceId: string) {
    const blockerTicketKey = (
      readStringArg(args, ['blocker_ticket_key', 'blockerTicketKey'])
      || readStringArg(args, ['ticketKey', 'ticket_key'])
    ).toUpperCase();
    const dependentTicketKey = (
      readStringArg(args, ['dependent_ticket_key', 'dependentTicketKey'])
      || readStringArg(args, ['dependencyTicketKey', 'dependency_ticket_key', 'dependencyKey'])
    ).toUpperCase();

    if (!blockerTicketKey || !dependentTicketKey) {
      throw new Error('blocker_ticket_key and dependent_ticket_key are required. Legacy aliases ticketKey and dependencyTicketKey are also supported.');
    }

    if (blockerTicketKey === dependentTicketKey) {
      throw new Error('A ticket cannot be both the blocker and the dependent in the same relationship.');
    }

    const blockerTicket = await this.getTicketByKeyInWorkspace(blockerTicketKey, workspaceId, 'Blocker ticket');
    const dependentTicket = await this.getTicketByKeyInWorkspace(dependentTicketKey, workspaceId, 'Dependent ticket');

    return { blockerTicket, dependentTicket };
  }

  private async resolveDependencyRemoval(args: Record<string, unknown>, workspaceId: string) {
    const explicitBlockerTicketKey = readStringArg(args, ['blocker_ticket_key', 'blockerTicketKey']).toUpperCase();
    const explicitDependentTicketKey = readStringArg(args, ['dependent_ticket_key', 'dependentTicketKey']).toUpperCase();

    if (explicitBlockerTicketKey || explicitDependentTicketKey) {
      if (!explicitBlockerTicketKey || !explicitDependentTicketKey) {
        throw new Error('blocker_ticket_key and dependent_ticket_key are both required when removing a specific blocker/dependency relationship.');
      }

      if (explicitBlockerTicketKey === explicitDependentTicketKey) {
        throw new Error('A ticket cannot remove a dependency relationship with itself.');
      }

      const blockerTicket = await this.getTicketByKeyInWorkspace(explicitBlockerTicketKey, workspaceId, 'Blocker ticket');
      const dependentTicket = await this.getTicketByKeyInWorkspace(explicitDependentTicketKey, workspaceId, 'Dependent ticket');

      if (!(await hasTicketDependencyRelation(blockerTicket.id, dependentTicket.id))) {
        throw new Error(`No dependency relationship exists where ${blockerTicket.key} blocks ${dependentTicket.key}.`);
      }

      return { blockerTicket, dependentTicket };
    }

    const ticketKey = readStringArg(args, ['ticket_key', 'ticketKey']).toUpperCase();
    const relatedTicketKey = readStringArg(args, ['dependency_ticket_key', 'dependencyTicketKey', 'dependencyKey']).toUpperCase();

    if (!ticketKey || !relatedTicketKey) {
      throw new Error('ticket_key and dependency_ticket_key are required for remove_ticket_dependency.');
    }

    if (ticketKey === relatedTicketKey) {
      throw new Error('A ticket cannot remove a dependency relationship with itself.');
    }

    const ticket = await this.getTicketByKeyInWorkspace(ticketKey, workspaceId, 'Ticket');
    const relatedTicket = await this.getTicketByKeyInWorkspace(relatedTicketKey, workspaceId, 'Dependency ticket');

    if (await hasTicketDependencyRelation(ticket.id, relatedTicket.id)) {
      return { blockerTicket: ticket, dependentTicket: relatedTicket };
    }

    if (await hasTicketDependencyRelation(relatedTicket.id, ticket.id)) {
      return { blockerTicket: relatedTicket, dependentTicket: ticket };
    }

    throw new Error(`No dependency or blocker relationship exists between ${ticket.key} and ${relatedTicket.key}.`);
  }

  /**
   * @description Verifies that the project anchor for a ticket-scoped action
   * belongs to the same workspace already authorized by the transport.
   * @param projectId Project id tied to the ticket action.
   * @param workspaceId Authorized workspace id.
   * @return Resolves when the project belongs to the authorized workspace.
   * @throws When the project does not exist or belongs to another workspace.
   */
  private async assertProjectInWorkspace(projectId: string, workspaceId: string) {
    const [project] = await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }

    if (project.workspaceId !== workspaceId) {
      throw await createWorkspaceScopeViolationError(workspaceId, {
        action: 'ticket_workspace_scope',
        projectId,
      });
    }
  }
}

export const ticketTools = new TicketTools();

export const ticketToolHandlers: Record<string, ToolHandler> = {
  list_tickets: (args, context) => ticketTools.listTickets(args, context),
  get_ticket_details: (args, context) => ticketTools.getTicketDetails(args, context),
  read_ticket_details: (args, context) => ticketTools.readTicketDetails(args, context),
  create_ticket: (args, context) => ticketTools.createTicket(args, context),
  delete_ticket: (args, context) => ticketTools.deleteTicket(args, context),
  update_ticket: (args, context) => ticketTools.updateTicket(args, context),
  add_comment: (args, context) => ticketTools.createComment(args, context),
  create_comment: (args, context) => ticketTools.createComment(args, context),
  read_comments: (args, context) => ticketTools.readComments(args, context),
  delete_comment: (args, context) => ticketTools.deleteComment(args, context),
  update_comment: (args, context) => ticketTools.updateComment(args, context),
  mark_ticket_blocked: (args, context) => ticketTools.markTicketBlocked(args, context, 'mark_ticket_blocked'),
  unmark_ticket_blocked: (args, context) => ticketTools.unmarkTicketBlocked(args, context, 'unmark_ticket_blocked'),
  preview_ticket_dependency: (args, context) => ticketTools.previewTicketDependency(args, context),
  add_dependency: (args, context) => ticketTools.markTicketBlocked(args, context, 'add_dependency'),
  remove_dependency: (args, context) => ticketTools.unmarkTicketBlocked(args, context, 'remove_dependency'),
  add_ticket_dependency: (args, context) => ticketTools.markTicketBlocked(args, context, 'add_ticket_dependency'),
  remove_ticket_dependency: (args, context) => ticketTools.unmarkTicketBlocked(args, context, 'remove_ticket_dependency'),
  list_ticket_dependencies: (args, context) => ticketTools.listTicketDependencyRelations(args, context),
  get_ticket_labels: (args, context) => ticketTools.getTicketLabels(args, context),
  add_ticket_labels: (args, context) => ticketTools.addTicketLabels(args, context),
  remove_ticket_labels: (args, context) => ticketTools.removeTicketLabels(args, context),
  set_ticket_labels: (args, context) => ticketTools.setTicketLabels(args, context),
  list_workspace_labels: (args, context) => ticketTools.listWorkspaceLabels(args, context),
};

export const ticketToolDefinitions: McpToolDefinition[] = [
  {
    name: 'list_tickets',
    description: 'Retrieve a list of tickets from the workspace with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        priority: { type: 'string' },
        projectId: { type: 'string' },
        assigneeId: { type: 'string' },
        cycleId: { type: 'string' },
        labels: { type: 'string', description: 'Comma-separated label IDs' },
        labelMode: { type: 'string', description: 'all | any' },
      },
    },
  },
  {
    name: 'get_ticket_details',
    description: 'Retrieve detailed information for a specific ticket by its unique ticket key.',
    inputSchema: {
      type: 'object',
      properties: { ticketKey: { type: 'string' } },
      required: ['ticketKey'],
    },
  },
  {
    name: 'read_ticket_details',
    description: 'Retrieve fully resolved details of a ticket including status, priority, assignee, project, domain, and cycle.',
    inputSchema: {
      type: 'object',
      properties: { ticketKey: { type: 'string' } },
      required: ['ticketKey'],
    },
  },
  {
    name: 'create_ticket',
    description: 'Create a new ticket or sub-ticket in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        projectId: { type: 'string' },
        cycleId: { type: 'string' },
        assigneeId: { type: 'string' },
        parentId: { type: 'string' },
        labels: { type: 'string', description: 'Comma-separated label IDs' },
        createdAt: {
          type: 'string',
          description: 'Optional manual override for the ticket creation timestamp as an ISO 8601 date string.',
        },
        updatedAt: {
          type: 'string',
          description: 'Optional manual override for the ticket last-updated timestamp as an ISO 8601 date string.',
        },
      },
      required: ['title', 'projectId'],
    },
  },
  {
    name: 'delete_ticket',
    description: 'Delete an existing ticket by ticket key.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'update_ticket',
    description: 'Modify properties of an existing ticket by its unique ticket key.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        assigneeId: { type: 'string' },
        cycleId: { type: 'string' },
        parentId: { type: 'string' },
        labels: { type: 'string', description: 'Comma-separated label IDs' },
        prStatus: { type: 'string' },
        prUrl: { type: 'string' },
        createdAt: {
          type: 'string',
          description: 'Optional manual override for the ticket creation timestamp as an ISO 8601 date string.',
        },
        updatedAt: {
          type: 'string',
          description: 'Optional manual override for the ticket last-updated timestamp as an ISO 8601 date string.',
        },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'mark_ticket_blocked',
    description: 'Mark a ticket as blocked by another ticket. blocker_ticket_key blocks dependent_ticket_key, and both blocker and dependency wording are treated interchangeably in the tool result.',
    inputSchema: {
      type: 'object',
      properties: {
        blocker_ticket_key: { type: 'string', description: 'The blocker ticket key, such as GRAV-123.' },
        dependent_ticket_key: { type: 'string', description: 'The dependent or blocked ticket key, such as GRAV-456.' },
        blockerTicketKey: { type: 'string', description: 'CamelCase alias for blocker_ticket_key.' },
        dependentTicketKey: { type: 'string', description: 'CamelCase alias for dependent_ticket_key.' },
      },
      required: ['blocker_ticket_key', 'dependent_ticket_key'],
    },
  },
  {
    name: 'add_ticket_dependency',
    description: 'Legacy alias for mark_ticket_blocked. Adds a blocker/dependency relationship so blocker_ticket_key blocks dependent_ticket_key.',
    inputSchema: {
      type: 'object',
      properties: {
        blocker_ticket_key: { type: 'string', description: 'The blocker ticket key, such as GRAV-123.' },
        dependent_ticket_key: { type: 'string', description: 'The dependent or blocked ticket key, such as GRAV-456.' },
        blockerTicketKey: { type: 'string', description: 'CamelCase alias for blocker_ticket_key.' },
        dependentTicketKey: { type: 'string', description: 'CamelCase alias for dependent_ticket_key.' },
        ticketKey: { type: 'string', description: 'Legacy alias for blocker_ticket_key.' },
        dependencyTicketKey: { type: 'string', description: 'Legacy alias for dependent_ticket_key.' },
      },
      required: ['blocker_ticket_key', 'dependent_ticket_key'],
    },
  },
  {
    name: 'unmark_ticket_blocked',
    description: 'Remove a blocker/dependency relationship so blocker_ticket_key no longer blocks dependent_ticket_key.',
    inputSchema: {
      type: 'object',
      properties: {
        blocker_ticket_key: { type: 'string', description: 'The blocker ticket key, such as GRAV-123.' },
        dependent_ticket_key: { type: 'string', description: 'The dependent or blocked ticket key, such as GRAV-456.' },
        blockerTicketKey: { type: 'string', description: 'CamelCase alias for blocker_ticket_key.' },
        dependentTicketKey: { type: 'string', description: 'CamelCase alias for dependent_ticket_key.' },
      },
      required: ['blocker_ticket_key', 'dependent_ticket_key'],
    },
  },
  {
    name: 'remove_ticket_dependency',
    description: 'Legacy alias for unmark_ticket_blocked. Remove a blocker/dependency relationship for ticket_key and dependency_ticket_key.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_key: { type: 'string', description: 'The ticket whose blockers/dependencies are being updated.' },
        dependency_ticket_key: { type: 'string', description: 'The related ticket key to remove as either a blocker or a dependent.' },
        blocker_ticket_key: { type: 'string', description: 'Optional explicit blocker ticket key when you want to target the exact direction.' },
        dependent_ticket_key: { type: 'string', description: 'Optional explicit dependent ticket key when you want to target the exact direction.' },
        ticketKey: { type: 'string', description: 'CamelCase alias for ticket_key.' },
        dependencyTicketKey: { type: 'string', description: 'CamelCase alias for dependency_ticket_key.' },
      },
      required: ['ticket_key', 'dependency_ticket_key'],
    },
  },
  {
    name: 'preview_ticket_dependency',
    description: 'Preview adding or removing a blocker/dependency relationship before mutating anything. Returns ok, status, and suggestedFix details so agents can avoid duplicate or circular dependency errors.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'remove'],
          description: 'Use add to preview creating a blocker/dependency relationship or remove to preview deleting one.',
        },
        blocker_ticket_key: { type: 'string', description: 'The blocker ticket key to analyze for an add or remove preview.' },
        dependent_ticket_key: { type: 'string', description: 'The dependent or blocked ticket key to analyze for an add or remove preview.' },
        ticket_key: { type: 'string', description: 'Legacy alias for the first ticket when previewing a removal.' },
        dependency_ticket_key: { type: 'string', description: 'Legacy alias for the related ticket when previewing a removal.' },
        blockerTicketKey: { type: 'string', description: 'CamelCase alias for blocker_ticket_key.' },
        dependentTicketKey: { type: 'string', description: 'CamelCase alias for dependent_ticket_key.' },
        ticketKey: { type: 'string', description: 'CamelCase alias for ticket_key.' },
        dependencyTicketKey: { type: 'string', description: 'CamelCase alias for dependency_ticket_key.' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'add_dependency',
    description: 'Legacy alias for mark_ticket_blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'Ticket that should block the dependency ticket.' },
        dependencyTicketKey: { type: 'string', description: 'The ticket key to add as a dependency.' },
      },
      required: ['ticketKey', 'dependencyTicketKey'],
    },
  },
  {
    name: 'remove_dependency',
    description: 'Legacy alias for unmark_ticket_blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'Ticket that owns the dependency relation.' },
        dependencyTicketKey: { type: 'string', description: 'The dependency ticket key to remove.' },
      },
      required: ['ticketKey', 'dependencyTicketKey'],
    },
  },
  {
    name: 'list_ticket_dependencies',
    description: 'List both blocked-by blockers and blocks dependents for a ticket using human-readable ticket keys, titles, statuses, and priorities.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_key: { type: 'string', description: 'The ticket key to inspect, such as GRAV-123.' },
        ticketKey: { type: 'string', description: 'CamelCase alias for ticket_key.' },
      },
      required: ['ticket_key'],
    },
  },
  {
    name: 'add_comment',
    description: 'Create a new comment on an existing ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        body: { type: 'string' },
        createdAt: {
          type: 'string',
          description: 'Optional manual override for the comment creation timestamp as an ISO 8601 date string.',
        },
      },
      required: ['ticketKey', 'body'],
    },
  },
  {
    name: 'create_comment',
    description: 'Create a new comment on an existing ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        body: { type: 'string' },
        createdAt: {
          type: 'string',
          description: 'Optional manual override for the comment creation timestamp as an ISO 8601 date string.',
        },
      },
      required: ['ticketKey', 'body'],
    },
  },
  {
    name: 'read_comments',
    description: 'Read all comment threads on a specific ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a specific comment on a ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        commentId: { type: 'string' },
      },
      required: ['ticketKey', 'commentId'],
    },
  },
  {
    name: 'update_comment',
    description: 'Update the text body of a specific comment on a ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        commentId: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['ticketKey', 'commentId', 'body'],
    },
  },
  {
    name: 'get_ticket_labels',
    description: 'Read all labels currently assigned to a specific ticket. Returns label objects with name, color, and description.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The ticket key, e.g. "GRAV-123".' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'add_ticket_labels',
    description: 'Add one or more labels to a ticket without removing existing ones. Duplicate labels are silently skipped. Use list_workspace_labels to discover valid label names.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The ticket key, e.g. "GRAV-123".' },
        labels: {
          type: 'string',
          description: 'Comma-separated list of label names to add, e.g. "bug,high-priority".',
        },
      },
      required: ['ticketKey', 'labels'],
    },
  },
  {
    name: 'remove_ticket_labels',
    description: 'Remove one or more labels from a ticket. Only removes the specified labels; all other labels remain intact. Labels not present on the ticket are silently skipped.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The ticket key, e.g. "GRAV-123".' },
        labels: {
          type: 'string',
          description: 'Comma-separated list of label names to remove.',
        },
      },
      required: ['ticketKey', 'labels'],
    },
  },
  {
    name: 'set_ticket_labels',
    description: 'Replace all labels on a ticket with a new set of labels. Use list_workspace_labels to discover valid label names.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The ticket key, e.g. "GRAV-123".' },
        labels: {
          type: 'string',
          description: 'Comma-separated list of the exact label names to set on the ticket, replacing all existing labels. Pass an empty string to clear all labels.',
        },
      },
      required: ['ticketKey', 'labels'],
    },
  },
  {
    name: 'list_workspace_labels',
    description: 'List all available labels in the workspace, or narrow to a specific project. Use this to discover valid label names before adding or setting labels on tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional project ID to narrow results to labels available in that project only.',
        },
      },
    },
  },
];
