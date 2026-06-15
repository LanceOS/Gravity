import { eq, and, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { projects, labels } from '../../db/schema.js';
import { audit } from '../../lib/logger.js';
import {
  addCommentRecord,
  createTicketRecord,
  deleteCommentRecord,
  getTicketByKey,
  getTicketDetailsByKey,
  listComments,
  listTickets,
  listWorkspaceTickets,
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

    return { ticket };
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

    return { ticket: updated };
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
    return { comment };
  }

  /**
   * @description Reads all labels currently assigned to a specific ticket.
   * @param args Tool arguments containing the ticket key.
   * @param context Trusted tool execution context.
   * @return A list of human-readable label names assigned to the ticket.
   * @throws When the ticket does not exist or belongs to another workspace.
   */
  async getTicketLabels(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, context.workspaceId);

    const labelNames = ticket.labels.map(l => l.name);
    return { labels: labelNames };
  }

  /**
   * @description Removes one or more labels from a ticket by name.
   * @param args Tool arguments containing the ticket key and label names to remove.
   * @param context Trusted tool execution context.
   * @return The updated list of label names on the ticket.
   * @throws When the ticket does not exist, belongs to another workspace, or label resolution fails.
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
    if (labelsToRemove.length === 0) {
      return { labels: ticket.labels.map(l => l.name) };
    }

    const currentLabels = ticket.labels;
    const namesToRemoveSet = new Set(labelsToRemove);
    const newLabelNames = currentLabels.map(l => l.name).filter(name => !namesToRemoveSet.has(name));

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
    const updated = await updateTicketRecord(ticket.id, { labelIds }, ticket.projectId);
    
    audit('remove_ticket_labels', {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      ticketKey,
      removedLabels: labelsToRemove,
      finalLabels: newLabelNames,
    });

    return { labels: updated?.labels.map(l => l.name) ?? [] };
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
    const updated = await updateTicketRecord(ticket.id, { labelIds }, ticket.projectId);

    audit('set_ticket_labels', {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      ticketKey,
      newLabels: labelNames,
    });

    return { labels: updated?.labels.map(l => l.name) ?? [] };
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
  update_ticket: (args, context) => ticketTools.updateTicket(args, context),
  add_comment: (args, context) => ticketTools.createComment(args, context),
  create_comment: (args, context) => ticketTools.createComment(args, context),
  read_comments: (args, context) => ticketTools.readComments(args, context),
  delete_comment: (args, context) => ticketTools.deleteComment(args, context),
  update_comment: (args, context) => ticketTools.updateComment(args, context),
  get_ticket_labels: (args, context) => ticketTools.getTicketLabels(args, context),
  remove_ticket_labels: (args, context) => ticketTools.removeTicketLabels(args, context),
  set_ticket_labels: (args, context) => ticketTools.setTicketLabels(args, context),
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
    description: 'Read all labels currently assigned to a specific ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'remove_ticket_labels',
    description: 'Remove one or more labels from a ticket. Only removes specified labels, leaves others intact.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
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
    description: 'Replace all labels on a ticket with a new set of labels.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        labels: {
          type: 'string',
          description: 'Comma-separated list of the exact label names to set on the ticket, replacing all existing labels.',
        },
      },
      required: ['ticketKey', 'labels'],
    },
  },
];
