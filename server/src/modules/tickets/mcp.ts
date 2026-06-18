import { asc, eq, and, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { projects, labels, teams, ticketLabels, workspaceSettings } from '../../db/schema.js';
import { audit } from '../../lib/logger.js';
import { mcpEventBus } from '../../lib/mcp-event-bus.js';
import {
  addCommentRecord,
  createTicketRecord,
  createTicketDependencyRelation,
  deleteCommentRecord,
  deleteTicketRecord,
  getTicketByKey,
  getTicketDetailsByKey,
  hasCircularDependency,
  hasTicketDependencyRelation,
  listComments,
  listTickets,
  listWorkspaceTickets,
  removeTicketDependencyRelation,
  updateCommentRecord,
  updateTicketRecord,
  getProjectScope,
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

    const ticket = await createTicketRecord({
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

    // Emit SSE event so connected clients refresh immediately.
    const scope = await getProjectScope(projectId);
    if (scope) {
      const eventType = ticket.parentId ? 'subtask.created' : 'ticket.created';
      mcpEventBus.publish({
        type: eventType,
        workspaceId: scope.workspaceId,
        projectId,
        teamId: scope.teamId,
        ticketKey: ticket.key,
        actorUserId: context.actorUserId,
        timestamp: new Date().toISOString(),
      });
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
      data: { ticketId: ticket.id },
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

    const updated = await updateTicketRecord(
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
      });
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
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const dependencyTicketKey = String((args.dependencyTicketKey ?? args.dependencyKey ?? '')).toUpperCase();
    if (!dependencyTicketKey) {
      throw new Error('dependencyTicketKey is required for add_dependency.');
    }

    if (dependencyTicketKey === ticket.key) {
      throw new Error('A ticket cannot depend on itself.');
    }

    const dependency = await getTicketByKey(dependencyTicketKey);
    if (!dependency) {
      throw new Error(`Dependency ticket ${dependencyTicketKey} not found.`);
    }

    await this.assertProjectInWorkspace(dependency.projectId, context.workspaceId);

    if (await hasTicketDependencyRelation(ticket.id, dependency.id)) {
      throw new Error('This ticket already blocks the selected ticket.');
    }
    if (await hasTicketDependencyRelation(dependency.id, ticket.id)) {
      throw new Error('This ticket is already blocked by the selected ticket.');
    }
    if (await hasCircularDependency(dependency.id, ticket.id)) {
      throw new Error('Circular dependency detected.');
    }

    const scope = await getProjectScope(ticket.projectId);
    if (!scope) {
      throw new Error(`Project ${ticket.projectId} not found.`);
    }

    await createTicketDependencyRelation(ticket.id, dependency.id, ticket.projectId);

    mcpEventBus.publish({
      type: 'dependency.added',
      workspaceId: scope.workspaceId,
      projectId: ticket.projectId,
      teamId: scope.teamId,
      ticketKey: ticket.key,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: { dependencyTicketKey },
    });

    return { success: true };
  }

  /**
   * @description Removes an existing dependency link from ticket to dependency ticket.
   * @param args Tool arguments containing both ticket keys.
   * @param context Trusted tool execution context.
   * @return Success wrapper.
   * @throws When either ticket is missing, cross-workspace, or relation does not exist.
   */
  async removeDependency(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const dependencyTicketKey = String((args.dependencyTicketKey ?? args.dependencyKey ?? '')).toUpperCase();
    if (!dependencyTicketKey) {
      throw new Error('dependencyTicketKey is required for remove_dependency.');
    }

    const dependency = await getTicketByKey(dependencyTicketKey);
    if (!dependency) {
      throw new Error(`Dependency ticket ${dependencyTicketKey} not found.`);
    }

    await this.assertProjectInWorkspace(dependency.projectId, context.workspaceId);

    if (!(await hasTicketDependencyRelation(ticket.id, dependency.id))) {
      throw new Error('Ticket is not a dependency of this ticket.');
    }

    const scope = await getProjectScope(ticket.projectId);
    if (!scope) {
      throw new Error(`Project ${ticket.projectId} not found.`);
    }

    await removeTicketDependencyRelation(ticket.id, dependency.id);

    mcpEventBus.publish({
      type: 'dependency.removed',
      workspaceId: scope.workspaceId,
      projectId: ticket.projectId,
      teamId: scope.teamId,
      ticketKey: ticket.key,
      actorUserId: context.actorUserId,
      timestamp: new Date().toISOString(),
      data: { dependencyTicketKey },
    });

    return { success: true };
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
        data: { commentId: comment.id },
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
          data: { commentId },
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
          data: { commentId },
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
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);

    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, workspaceId);
    return ticket;
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

    if (!project || project.workspaceId !== workspaceId) {
      throw new Error('Unauthorized or workspace mismatch');
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
  add_dependency: (args, context) => ticketTools.addDependency(args, context),
  remove_dependency: (args, context) => ticketTools.removeDependency(args, context),
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
    name: 'add_dependency',
    description: 'Add a dependency so ticketKey blocks dependencyTicketKey.',
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
    description: 'Remove a dependency from ticketKey to dependencyTicketKey.',
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
