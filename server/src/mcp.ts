import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from './db/index.js';
import { authUsers, projects, userProfiles, workspaceMemberActivity, workspaceMembers, workspaceSettings } from './db/schema.js';
import { addCommentRecord, createTicketRecord, deleteCommentRecord, getTicketByKey, getTicketDetailsByKey, listComments, listTickets, updateTicketRecord, updateCommentRecord } from './services/tickets.js';

export const mcpToolsList = [
  {
    name: 'list_tickets',
    description: 'Retrieve a list of tickets from the workspace with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        priority: { type: 'string' },
        projectId: { type: 'string' },
        domainId: { type: 'string' },
        assigneeId: { type: 'string' },
        cycleId: { type: 'string' },
      },
    },
  },
  {
    name: 'list_workspace_members',
    description: 'Retrieve a list of members in a workspace, including their roles and last active times.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
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
        domainId: { type: 'string' },
        cycleId: { type: 'string' },
        assigneeId: { type: 'string' },
        parentId: { type: 'string' },
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
        domainId: { type: 'string' },
        cycleId: { type: 'string' },
        parentId: { type: 'string' },
        prStatus: { type: 'string' },
        prUrl: { type: 'string' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'create_comment',
    description: 'Create a new comment on an existing ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        userId: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['ticketKey', 'userId', 'body'],
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
];

export async function executeTool(name: string, args: Record<string, unknown>) {
  if (name === 'list_tickets') {
    const explicitProjectId = typeof args.projectId === 'string' ? args.projectId : undefined;
    const projectIds = explicitProjectId
      ? [explicitProjectId]
      : (await db.select({ id: projects.id }).from(projects)).map((project) => project.id);

    const ticketsByProject = await Promise.all(
      projectIds.map((projectId) =>
        listTickets(projectId, {
          status: typeof args.status === 'string' ? args.status : undefined,
          priority: typeof args.priority === 'string' ? args.priority : undefined,
          domainId: typeof args.domainId === 'string' ? args.domainId : undefined,
          assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : undefined,
          cycleId: typeof args.cycleId === 'string' ? args.cycleId : undefined,
        }),
      ),
    );

    return ticketsByProject.flat();
  }

  if (name === 'list_workspace_members') {
    const workspaceId = String(args.workspaceId ?? '');
    if (!workspaceId) {
      throw new Error('workspaceId is required.');
    }

    const members = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        image: authUsers.image,
        avatarUrl: userProfiles.avatarUrl,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
        lastActiveAt: workspaceMemberActivity.lastActiveAt,
      })
      .from(workspaceMembers)
      .innerJoin(authUsers, eq(authUsers.id, workspaceMembers.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, workspaceMembers.userId))
      .leftJoin(
        workspaceMemberActivity,
        and(
          eq(workspaceMemberActivity.userId, workspaceMembers.userId),
          eq(workspaceMemberActivity.workspaceId, workspaceMembers.workspaceId)
        )
      )
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.createdAt));

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatarUrl || m.image || '',
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      lastActiveAt: m.lastActiveAt?.toISOString() || null,
    }));
  }

  if (name === 'get_ticket_details') {
    const ticketKey = String(args.ticketKey ?? '');
    const details = await getTicketDetailsByKey(ticketKey);
    if (!details) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }
    return details;
  }

  if (name === 'create_ticket') {
    const ticket = await createTicketRecord({
      title: String(args.title ?? ''),
      description: typeof args.description === 'string' ? args.description : '',
      status: typeof args.status === 'string' ? args.status : 'todo',
      priority: typeof args.priority === 'string' ? args.priority : 'no_priority',
      projectId: String(args.projectId ?? ''),
      domainId: typeof args.domainId === 'string' ? args.domainId : null,
      cycleId: typeof args.cycleId === 'string' ? args.cycleId : null,
      assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : null,
      parentId: typeof args.parentId === 'string' ? args.parentId : null,
    });
    return { ticket };
  }

  if (name === 'update_ticket') {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }

    const updated = await updateTicketRecord(ticket.id, {
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
    }, ticket.projectId);

    return { ticket: updated };
  }

  if (name === 'create_comment') {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }
    const userId = String(args.userId ?? '');
    const body = String(args.body ?? '');
    if (!userId || !body) throw new Error('userId and body are required for create_comment.');
    const comment = await addCommentRecord(ticket.id, userId, body);
    return { comment };
  }

  if (name === 'read_comments') {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }
    const comments = await listComments(ticket.id);
    return { comments };
  }

  if (name === 'delete_comment') {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }
    const commentId = String(args.commentId ?? '');
    if (!commentId) throw new Error('commentId is required for delete_comment.');
    const success = await deleteCommentRecord(commentId, ticket.id);
    return { success };
  }

  if (name === 'update_comment') {
    const ticketKey = String(args.ticketKey ?? '').toUpperCase();
    const ticket = await getTicketByKey(ticketKey);
    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    }
    const commentId = String(args.commentId ?? '');
    const body = String(args.body ?? '');
    if (!commentId || !body) throw new Error('commentId and body are required for update_comment.');
    const comment = await updateCommentRecord(commentId, ticket.id, body);
    return { comment };
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function handleMcpRequest(request: unknown, workspaceId?: string) {
  const payload = request as {
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
    id?: string | number | null;
  };

  if (payload.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'gravity-mcp-server', version: '2.0.0' },
      },
    };
  }

  if (payload.method === 'tools/list') {
    let activeTools = mcpToolsList;
    if (workspaceId) {
      const [settings] = await db
        .select({ disabledMcpTools: workspaceSettings.disabledMcpTools })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, workspaceId))
        .limit(1);
      if (settings && Array.isArray(settings.disabledMcpTools)) {
        const disabled = settings.disabledMcpTools as string[];
        activeTools = mcpToolsList.filter((tool) => !disabled.includes(tool.name));
      }
    }

    return {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      result: { tools: activeTools },
    };
  }

  if (payload.method === 'tools/call') {
    try {
      const toolName = payload.params?.name ?? '';
      if (workspaceId) {
        const [settings] = await db
          .select({ disabledMcpTools: workspaceSettings.disabledMcpTools })
          .from(workspaceSettings)
          .where(eq(workspaceSettings.workspaceId, workspaceId))
          .limit(1);
        if (settings && Array.isArray(settings.disabledMcpTools)) {
          const disabled = settings.disabledMcpTools as string[];
          if (disabled.includes(toolName)) {
            throw new Error(`MCP tool "${toolName}" is disabled in this workspace.`);
          }
        }
      }

      const result = await executeTool(toolName, payload.params?.arguments ?? {});
      return {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error executing tool',
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id: payload.id ?? null,
    error: {
      code: -32601,
      message: `Method not found: ${payload.method ?? 'unknown'}`,
    },
  };
}

export function createMcpRouter() {
  const router = Router();

  router.post('/mcp/sse', async (req, res) => {
    const workspaceId = req.header('x-workspace-id') || req.header('X-Workspace-Id') || undefined;
    const response = await handleMcpRequest(req.body, workspaceId);
    res.json(response);
  });

  return router;
}