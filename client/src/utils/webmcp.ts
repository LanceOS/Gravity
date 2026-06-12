/**
 * WebMCP Browser Native Tool Registration
 * 
 * Provides client-side programmatic tool exposure to Chromium AI agents
 * using navigator.modelContext early preview APIs.
 */

interface WebMCPActions {
  createTicket: (payload: any) => Promise<any>;
  updateTicket: (id: string, updates: any) => Promise<void>;
  addComment: (ticketId: string, body: string) => Promise<void>;
  getTickets: () => any[];
  getUsers: () => any[];
  getProjects: () => any[];
}

export function registerWebMCPTools(actions: WebMCPActions): AbortController | null {
  // 1. Feature detection
  const nav = navigator as any;
  if (!('modelContext' in nav) || !('registerTool' in nav.modelContext)) {
    return null;
  }


  const controller = new AbortController();
  const signal = controller.signal;

  try {
    // Tool 1: list-tickets
    nav.modelContext.registerTool({
      name: 'list-tickets',
      description: 'Fetch the active project management tickets in the browser tab workspace.',
      inputSchema: { type: 'object', properties: {} },
      execute() {
        return actions.getTickets();
      },
      annotations: { readOnlyHint: true }
    }, { signal });

    // Tool 2: create-ticket
    nav.modelContext.registerTool({
      name: 'create-ticket',
      description: 'Create a new project ticket inside the current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The title of the ticket' },
          description: { type: 'string', description: 'The description of the ticket (markdown supported)' },
          status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] },
          priority: { type: 'string', enum: ['no_priority', 'low', 'medium', 'high', 'urgent'] },
          projectId: { type: 'string', description: 'The project ID, e.g. p-gravity' },
          labelId: { type: 'string', description: 'The label ID, e.g. l-fe' }
        },
        required: ['title', 'projectId']
      },
      async execute(args: any) {
        const result = await actions.createTicket(args);
        return result ? `Ticket ${result.key} created successfully!` : 'Failed to create ticket';
      }
    }, { signal });

    // Tool 3: update-ticket
    nav.modelContext.registerTool({
      name: 'update-ticket',
      description: 'Modify details of an existing ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The database ID of the ticket' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] },
          priority: { type: 'string', enum: ['no_priority', 'low', 'medium', 'high', 'urgent'] }
        },
        required: ['id']
      },
      async execute(args: any) {
        const id = args.id;
        const updates = { ...args };
        delete updates.id;
        
        await actions.updateTicket(id, updates);
        return `Ticket ID ${id} was updated.`;
      }
    }, { signal });

    // Tool 4: add-comment
    nav.modelContext.registerTool({
      name: 'add-comment',
      description: 'Post a comment on a ticket.',
      inputSchema: {
        type: 'object',
        properties: {
          ticketId: { type: 'string', description: 'The database ID of the ticket' },
          body: { type: 'string', description: 'The comment text body' }
        },
        required: ['ticketId', 'body']
      },
      async execute(args: any) {
        await actions.addComment(args.ticketId, args.body);
        return 'Comment posted successfully.';
      }
    }, { signal });

  } catch (error) {
    console.error('Gravity: WebMCP tool registration failed:', error);
  }

  // Return the AbortController so that the parent hook can call controller.abort() on unmount!
  return controller;
}
