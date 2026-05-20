import { centralDb, getProjectDb } from './db.js';
import { broadcastEvent } from './webhooks.js';

// Expose MCP tool definition metadata
export const mcpToolsList = [
  {
    name: 'list_tickets',
    description: 'Retrieve a list of tickets from the workspace with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'], description: 'Filter by ticket status' },
        priority: { type: 'string', enum: ['no_priority', 'low', 'medium', 'high', 'urgent'], description: 'Filter by ticket priority' },
        projectId: { type: 'string', description: 'Filter by project ID (e.g. p-gravity)' },
        domainId: { type: 'string', description: 'Filter by domain ID (e.g. d-fe)' },
        assigneeId: { type: 'string', description: 'Filter by assignee ID (e.g. u-lance)' },
        cycleId: { type: 'string', description: 'Filter by cycle ID (e.g. c-1)' }
      }
    }
  },
  {
    name: 'get_ticket_details',
    description: 'Retrieve detailed information for a specific ticket, including its comments and sub-tickets, by its unique ticket key.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The unique key of the ticket, e.g. GRA-1' }
      },
      required: ['ticketKey']
    }
  },
  {
    name: 'create_ticket',
    description: 'Create a new ticket or sub-ticket in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The title of the ticket' },
        description: { type: 'string', description: 'Detailed description of the ticket (markdown supported)' },
        status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'], default: 'todo', description: 'Initial ticket status' },
        priority: { type: 'string', enum: ['no_priority', 'low', 'medium', 'high', 'urgent'], default: 'no_priority', description: 'Ticket priority' },
        projectId: { type: 'string', description: 'The ID of the project to assign this ticket to, e.g., p-gravity' },
        domainId: { type: 'string', description: 'The ID of the domain to assign, e.g., d-fe' },
        cycleId: { type: 'string', description: 'The ID of the cycle to assign, e.g., c-1' },
        assigneeId: { type: 'string', description: 'The user ID to assign, e.g., u-bob' },
        parentId: { type: 'string', description: 'The database ID of the parent ticket, if this is a sub-ticket' }
      },
      required: ['title', 'projectId']
    }
  },
  {
    name: 'update_ticket',
    description: 'Modify properties of an existing ticket by its unique ticket key.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The unique key of the ticket to update, e.g., GRA-1' },
        title: { type: 'string', description: 'Updated title' },
        description: { type: 'string', description: 'Updated description' },
        status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'], description: 'Updated status' },
        priority: { type: 'string', enum: ['no_priority', 'low', 'medium', 'high', 'urgent'], description: 'Updated priority' },
        assigneeId: { type: 'string', description: 'Updated assignee user ID (pass null or empty string to unassign)' },
        domainId: { type: 'string', description: 'Updated domain ID' },
        cycleId: { type: 'string', description: 'Updated cycle ID' },
        parentId: { type: 'string', description: 'Updated parent ticket database ID' },
        prStatus: { type: 'string', enum: ['open', 'merged', 'closed', 'none'], description: 'Updated pull request status' },
        prUrl: { type: 'string', description: 'Updated pull request URL' }
      },
      required: ['ticketKey']
    }
  },
  {
    name: 'add_comment',
    description: 'Post a comment updates on an existing ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string', description: 'The unique key of the ticket to comment on, e.g. GRA-1' },
        userId: { type: 'string', description: 'The database ID of the user posting the comment, e.g. u-alice' },
        body: { type: 'string', description: 'The content of the comment' }
      },
      required: ['ticketKey', 'userId', 'body']
    }
  }
];

// JSON-RPC Request router
export async function handleMcpRequest(request: any): Promise<any> {
  const { method, params, id } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'gravity-mcp-server',
          version: '1.0.0'
        }
      }
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: mcpToolsList
      }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      const toolResult = await executeTool(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
            }
          ]
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error.message || 'Internal error executing tool'
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

// Tool runner
async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_tickets': {
      let projectsToQuery: string[] = [];
      if (args?.projectId) {
        projectsToQuery = [args.projectId];
      } else {
        const projects = centralDb.prepare('SELECT id FROM projects').all() as { id: string }[];
        projectsToQuery = projects.map(p => p.id);
      }

      let allTickets: any[] = [];
      const sqlParams: any[] = [];
      let baseQuery = 'SELECT * FROM tickets WHERE 1=1';

      if (args?.status) {
        baseQuery += ' AND status = ?';
        sqlParams.push(args.status);
      }
      if (args?.priority) {
        baseQuery += ' AND priority = ?';
        sqlParams.push(args.priority);
      }
      if (args?.domainId) {
        baseQuery += ' AND domainId = ?';
        sqlParams.push(args.domainId);
      }
      if (args?.assigneeId) {
        baseQuery += ' AND assigneeId = ?';
        sqlParams.push(args.assigneeId);
      }
      if (args?.cycleId) {
        baseQuery += ' AND cycleId = ?';
        sqlParams.push(args.cycleId);
      }
      baseQuery += ' ORDER BY key ASC';

      for (const projectId of projectsToQuery) {
        try {
          const pdb = getProjectDb(projectId);
          const tickets = pdb.prepare(baseQuery).all(...sqlParams);
          allTickets = allTickets.concat(tickets);
        } catch (err: any) {
          console.error(`Error listing tickets for project ${projectId}: ${err.message}`);
        }
      }

      return allTickets;
    }

    case 'get_ticket_details': {
      const ticketKey = args.ticketKey?.toUpperCase();
      const prefix = ticketKey.split('-')[0];
      if (!prefix) {
        throw new Error(`Invalid ticket key format: ${ticketKey}`);
      }

      const project = centralDb.prepare('SELECT * FROM projects WHERE upper(key) = ?').get(prefix) as any;
      if (!project) {
        throw new Error(`Project with prefix ${prefix} not found.`);
      }

      const pdb = getProjectDb(project.id);
      const ticket = pdb.prepare('SELECT * FROM tickets WHERE key = ?').get(ticketKey) as any;

      if (!ticket) {
        throw new Error(`Ticket with key ${ticketKey} not found in project ${project.name}.`);
      }

      // Fetch comments (joining with central users)
      const comments = pdb.prepare(`
        SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
        FROM comments 
        JOIN central.users ON comments.userId = central.users.id 
        WHERE ticketId = ? 
        ORDER BY createdAt ASC
      `).all(ticket.id);

      // Fetch sub-tickets
      const subTickets = pdb.prepare('SELECT * FROM tickets WHERE parentId = ?').all(ticket.id);

      return {
        ...ticket,
        comments,
        subTickets
      };
    }

    case 'create_ticket': {
      const { title, description, status, priority, projectId, domainId, cycleId, assigneeId, parentId } = args;

      const project = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found.`);
      }

      const pdb = getProjectDb(projectId);
      const countRow = pdb.prepare('SELECT COUNT(*) as count FROM tickets').get() as { count: number };
      const nextNum = countRow.count + 1;
      const key = `${project.key}-${nextNum}`;

      const id = `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const now = new Date().toISOString();

      pdb.prepare(`
        INSERT INTO tickets (id, key, title, description, status, priority, assigneeId, projectId, domainId, cycleId, parentId, prStatus, prUrl, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        key,
        title,
        description || '',
        status || 'todo',
        priority || 'no_priority',
        assigneeId || null,
        projectId,
        domainId || null,
        cycleId || null,
        parentId || null,
        'none',
        null,
        now,
        now
      );

      const created = pdb.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as any;

      // Broadcast updates via SSE
      broadcastEvent('tickets-updated', { 
        projectId, 
        tickets: pdb.prepare('SELECT * FROM tickets').all() 
      });

      return {
        message: `Ticket ${key} created successfully.`,
        ticket: created
      };
    }

    case 'update_ticket': {
      const ticketKey = args.ticketKey?.toUpperCase();
      const prefix = ticketKey.split('-')[0];
      if (!prefix) {
        throw new Error(`Invalid ticket key format: ${ticketKey}`);
      }

      const project = centralDb.prepare('SELECT * FROM projects WHERE upper(key) = ?').get(prefix) as any;
      if (!project) {
        throw new Error(`Project with prefix key ${prefix} not found.`);
      }

      const pdb = getProjectDb(project.id);
      const ticket = pdb.prepare('SELECT * FROM tickets WHERE key = ?').get(ticketKey) as any;

      if (!ticket) {
        throw new Error(`Ticket with key ${ticketKey} not found.`);
      }

      const updates = { ...args };
      delete updates.ticketKey;

      const fields: string[] = [];
      const sqlParams: any[] = [];

      Object.entries(updates).forEach(([field, val]) => {
        const finalVal = val === '' || val === 'null' ? null : val;
        fields.push(`${field} = ?`);
        sqlParams.push(finalVal);
      });

      if (fields.length === 0) {
        return { message: 'No updates provided.', ticket };
      }

      const now = new Date().toISOString();
      fields.push('updatedAt = ?');
      sqlParams.push(now);

      sqlParams.push(ticket.id); // For the WHERE clause

      pdb.prepare(`
        UPDATE tickets
        SET ${fields.join(', ')}
        WHERE id = ?
      `).run(...sqlParams);

      const updated = pdb.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id) as any;

      // Broadcast updates via SSE
      broadcastEvent('tickets-updated', { 
        projectId: project.id, 
        tickets: pdb.prepare('SELECT * FROM tickets').all() 
      });

      return {
        message: `Ticket ${ticketKey} updated successfully.`,
        ticket: updated
      };
    }

    case 'add_comment': {
      const { ticketKey, userId, body } = args;
      const prefix = ticketKey?.toUpperCase().split('-')[0];
      if (!prefix) {
        throw new Error(`Invalid ticket key: ${ticketKey}`);
      }

      const project = centralDb.prepare('SELECT * FROM projects WHERE upper(key) = ?').get(prefix) as any;
      if (!project) {
        throw new Error(`Project with key prefix ${prefix} not found.`);
      }

      const pdb = getProjectDb(project.id);
      const ticket = pdb.prepare('SELECT * FROM tickets WHERE key = ?').get(ticketKey?.toUpperCase()) as any;

      if (!ticket) {
        throw new Error(`Ticket with key ${ticketKey} not found.`);
      }

      const user = centralDb.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      if (!user) {
        throw new Error(`User with ID ${userId} not found.`);
      }

      const id = `co-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const now = new Date().toISOString();

      pdb.prepare(`
        INSERT INTO comments (id, ticketId, userId, body, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, ticket.id, userId, body, now);

      const created = pdb.prepare(`
        SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
        FROM comments 
        JOIN central.users ON comments.userId = central.users.id 
        WHERE comments.id = ?
      `).get(id) as any;

      // Narrowed comments update broadcast
      const ticketComments = pdb.prepare(`
        SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
        FROM comments 
        JOIN central.users ON comments.userId = central.users.id 
        WHERE ticketId = ? 
        ORDER BY createdAt ASC
      `).all(ticket.id);
      
      broadcastEvent('comments-updated', { ticketId: ticket.id, comments: ticketComments });

      return {
        message: 'Comment added successfully.',
        comment: created
      };
    }

    default:
      throw new Error(`Unknown tool name: ${name}`);
  }
}

