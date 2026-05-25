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

export class TicketTools {
  async listTickets(args: Record<string, unknown>, context: ToolExecutionContext) {
    const explicitProjectId = typeof args.projectId === 'string' ? args.projectId : undefined;
    const validProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, context.workspaceId));
    const validProjectIds = validProjects.map((project) => project.id);

    if (explicitProjectId && !validProjectIds.includes(explicitProjectId)) {
      throw new Error('Unauthorized or workspace mismatch');
    }

    const projectIds = explicitProjectId ? [explicitProjectId] : validProjectIds;
    const filters = {
      status: typeof args.status === 'string' ? args.status : undefined,
      priority: typeof args.priority === 'string' ? args.priority : undefined,
      domainId: typeof args.domainId === 'string' ? args.domainId : undefined,
      assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : undefined,
      cycleId: typeof args.cycleId === 'string' ? args.cycleId : undefined,
    };

    if (explicitProjectId) {
      return listTickets(explicitProjectId, filters);
    }

    return listWorkspaceTickets(projectIds, filters);
  }

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
    });

    return { ticket };
  }

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
      },
      ticket.projectId,
    );

    return { ticket: updated };
  }

  async createComment(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const userId = context.actorUserId;
    const body = String(args.body ?? '');

    if (!userId) {
      throw new Error('Authenticated user is required for create_comment.');
    }

    if (!body) {
      throw new Error('body is required for create_comment.');
    }

    const comment = await addCommentRecord(ticket.id, userId, body);
    return { comment };
  }

  async readComments(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const comments = await listComments(ticket.id);
    return { comments };
  }

  async deleteComment(args: Record<string, unknown>, context: ToolExecutionContext) {
    const ticket = await this.getTicketInWorkspace(args, context.workspaceId);
    const commentId = String(args.commentId ?? '');

    if (!commentId) {
      throw new Error('commentId is required for delete_comment.');
    }

    const success = await deleteCommentRecord(commentId, ticket.id);
    return { success };
  }

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

  private async getTicketInWorkspace(args: Record<string, unknown>, workspaceId: string) {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);

    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    await this.assertProjectInWorkspace(ticket.projectId, workspaceId);
    return ticket;
  }

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
