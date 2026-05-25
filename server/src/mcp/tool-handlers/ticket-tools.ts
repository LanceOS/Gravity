import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { projects } from '../../db/schema.js';
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
} from '../../services/tickets.js';
import { ToolExecutionContext } from './types.js';

/**
 * @description Ticket-focused MCP handlers. Each method re-checks that the
 * target project or ticket belongs to the caller's trusted workspace before
 * touching ticket data.
 */
export class TicketTools {
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
      domainId: typeof args.domainId === 'string' ? args.domainId : undefined,
      assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : undefined,
      cycleId: typeof args.cycleId === 'string' ? args.cycleId : undefined,
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
    const projectId = String(args.projectId ?? '');
    await this.assertProjectInWorkspace(projectId, context.workspaceId);

    const ticket = await createTicketRecord({
      title: String(args.title ?? ''),
      description: typeof args.description === 'string' ? args.description : '',
      status: typeof args.status === 'string' ? args.status : 'todo',
      priority: typeof args.priority === 'string' ? args.priority : 'no_priority',
      projectId,
      domainId: typeof args.domainId === 'string' ? args.domainId : null,
      cycleId: typeof args.cycleId === 'string' ? args.cycleId : null,
      assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : null,
      parentId: typeof args.parentId === 'string' ? args.parentId : null,
      createdAt: typeof args.createdAt === 'string' ? new Date(args.createdAt) : undefined,
      updatedAt: typeof args.updatedAt === 'string' ? new Date(args.updatedAt) : undefined,
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

    const updated = await updateTicketRecord(
      ticket.id,
      {
        ...(typeof args.title === 'string' ? { title: args.title } : {}),
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(typeof args.status === 'string' ? { status: args.status } : {}),
        ...(typeof args.priority === 'string' ? { priority: args.priority } : {}),
        ...(typeof args.assigneeId === 'string' ? { assigneeId: args.assigneeId } : {}),
        ...(typeof args.domainId === 'string' ? { domainId: args.domainId } : {}),
        ...(typeof args.cycleId === 'string' ? { cycleId: args.cycleId } : {}),
        ...(typeof args.parentId === 'string' ? { parentId: args.parentId } : {}),
        ...(typeof args.prStatus === 'string' ? { prStatus: args.prStatus } : {}),
        ...(typeof args.prUrl === 'string' ? { prUrl: args.prUrl } : {}),
        ...(typeof args.createdAt === 'string' ? { createdAt: new Date(args.createdAt) } : {}),
        ...(typeof args.updatedAt === 'string' ? { updatedAt: new Date(args.updatedAt) } : {}),
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

    const createdAt = typeof args.createdAt === 'string' ? new Date(args.createdAt) : undefined;
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
