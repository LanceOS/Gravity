import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock standard JSDOM/browser API gaps
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

// In-memory mock database state for client E2E
export interface MockState {
  currentUser: { id: string; name: string; email: string } | null;
  tutorialCompleted: boolean;
  workspaces: Array<{ id: string; name: string; defaultProjectId: string | null; role: string }>;
  projects: Array<{ id: string; workspaceId: string; name: string; key: string }>;
  tickets: Array<{
    id: string;
    key: string;
    title: string;
    description: string;
    status: 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    projectId: string;
    domainId: string | null;
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
    createdAt: string;
    prStatus: 'open' | 'merged' | 'closed' | 'none';
    prUrl: string | null;
  }>;
  domains: Array<{ id: string; projectId: string; name: string; slug: string }>;
  cycles: Array<{ id: string; projectId: string; name: string; number: number; active: boolean }>;
  comments: Array<{ id: string; ticketId: string; body: string; userId: string; createdAt: string }>;
  accountSettings: {
    userId: string;
    theme: 'dark' | 'light';
    projectLayout: 'condensed' | 'spacious';
    notificationsEnabled: boolean;
  } | null;
}

export let dbState: MockState = {
  currentUser: null,
  tutorialCompleted: false,
  workspaces: [],
  projects: [],
  tickets: [],
  domains: [],
  cycles: [],
  comments: [],
  accountSettings: null,
};

export function resetMockDb() {
  dbState = {
    currentUser: null,
    tutorialCompleted: false,
    workspaces: [],
    projects: [],
    tickets: [],
    domains: [],
    cycles: [],
    comments: [],
    accountSettings: null,
  };
}

beforeEach(() => {
  resetMockDb();
});

afterEach(() => {
  cleanup();
});

// Custom fetch router mock
globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method?.toUpperCase() || 'GET';
  const body = init?.body ? JSON.parse(init.body as string) : null;

  // Helper responses
  const jsonResponse = (status: number, data: any) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : data),
      text: async () => JSON.stringify(data),
    } as unknown as Response;
  };

  // --- AUTH ENDPOINTS ---
  if (url === '/api/auth/session') {
    if (dbState.currentUser) {
      return jsonResponse(200, {
        session: { user: dbState.currentUser },
        user: dbState.currentUser,
      });
    }
    return jsonResponse(200, null);
  }

  if (url === '/api/auth/sign-up') {
    const { name, email } = body;
    dbState.currentUser = { id: `usr-${Date.now()}`, name, email, tutorial_completed: 0 } as any;
    dbState.accountSettings = {
      userId: dbState.currentUser.id,
      theme: 'dark',
      projectLayout: 'spacious',
      notificationsEnabled: true,
    };
    return jsonResponse(200, {
      user: dbState.currentUser,
    });
  }

  if (url === '/api/auth/sign-in') {
    const { email } = body;
    dbState.currentUser = { id: `usr-${Date.now()}`, name: email.split('@')[0], email, tutorial_completed: 0 } as any;
    dbState.accountSettings = {
      userId: dbState.currentUser.id,
      theme: 'dark',
      projectLayout: 'spacious',
      notificationsEnabled: true,
    };
    return jsonResponse(200, {
      user: dbState.currentUser,
    });
  }

  if (url === '/api/auth/sign-out') {
    dbState.currentUser = null;
    return jsonResponse(200, { success: true });
  }

  // --- WORKSPACE DIRECTORY ---
  if (url === '/api/v1/workspaces' && method === 'GET') {
    return jsonResponse(200, dbState.workspaces);
  }

  if (url === '/api/v1/workspaces' && method === 'POST') {
    const { name } = body;
    const ws = {
      id: `wsp-${Date.now()}`,
      name,
      defaultProjectId: null,
      role: 'owner',
    };
    dbState.workspaces.push(ws);
    return jsonResponse(201, { workspace: ws });
  }

  // --- ACCOUNT SETTINGS ---
  if (url.startsWith('/api/v1/settings/') && method === 'GET') {
    return jsonResponse(200, dbState.accountSettings || {});
  }

  if (url.startsWith('/api/v1/settings/') && method === 'PATCH') {
    if (dbState.accountSettings) {
      dbState.accountSettings = { ...dbState.accountSettings, ...body };
    }
    return jsonResponse(200, dbState.accountSettings || {});
  }

  // --- TUTORIAL / ONBOARDING ---
  if (url.includes('/tutorial') && method === 'PATCH') {
    dbState.tutorialCompleted = body.completed;
    return jsonResponse(200, { success: true });
  }

  // --- OLLAMA AI MODELS ---
  if (url.includes('/api/v1/ai/ollama/models')) {
    return jsonResponse(200, {
      connected: true,
      models: [{ name: 'llama3:latest' }, { name: 'mistral:latest' }],
    });
  }

  // --- PROJECTS ---
  if (url.startsWith('/api/v1/projects') && method === 'GET') {
    return jsonResponse(200, dbState.projects);
  }

  if (url.startsWith('/api/v1/projects') && method === 'POST') {
    const { name, key, workspaceId } = body;
    const project = {
      id: `prj-${Date.now()}`,
      workspaceId,
      name,
      key,
    };
    dbState.projects.push(project);
    // Auto-update workspace default project id if not set
    const ws = dbState.workspaces.find(w => w.id === workspaceId);
    if (ws && !ws.defaultProjectId) {
      ws.defaultProjectId = project.id;
    }
    return jsonResponse(201, project);
  }

  // --- DOMAINS ---
  if (url.startsWith('/api/v1/domains') && method === 'GET') {
    return jsonResponse(200, dbState.domains);
  }

  if (url.startsWith('/api/v1/domains') && method === 'POST') {
    const domain = {
      id: `dom-${Date.now()}`,
      projectId: body.projectId,
      name: body.name,
      slug: body.name.toLowerCase().replace(/\s+/g, '-'),
    };
    dbState.domains.push(domain);
    return jsonResponse(201, domain);
  }

  // --- CYCLES ---
  if (url.startsWith('/api/v1/cycles') && method === 'GET') {
    return jsonResponse(200, dbState.cycles);
  }

  // --- COMMENTS ---
  if (url.includes('/comments') && method === 'GET') {
    const ticketId = url.split('/')[4];
    const ticketComments = dbState.comments.filter(c => c.ticketId === ticketId);
    return jsonResponse(200, ticketComments);
  }

  if (url.includes('/comments') && method === 'POST') {
    const ticketId = url.split('/')[4];
    const comment = {
      id: `cmt-${Date.now()}`,
      ticketId,
      body: body.body,
      userId: dbState.currentUser?.id || 'anonymous',
      createdAt: new Date().toISOString(),
    };
    dbState.comments.push(comment);
    return jsonResponse(201, comment);
  }

  // --- TICKETS ---
  if (url.startsWith('/api/v1/tickets') && method === 'GET') {
    // Return all tickets (context filters on projectId on clientside)
    return jsonResponse(200, dbState.tickets);
  }

  if (url.startsWith('/api/v1/tickets') && method === 'POST') {
    const ticketId = `tkt-${Date.now()}`;
    const newTicket = {
      id: ticketId,
      key: `${body.projectKey || 'GRV'}-${dbState.tickets.length + 1}`,
      title: body.title,
      description: body.description || '',
      status: body.status || 'todo',
      priority: body.priority || 'medium',
      projectId: body.projectId,
      domainId: body.domainId || null,
      cycleId: body.cycleId || null,
      assigneeId: body.assigneeId || null,
      parentId: body.parentId || null,
      createdAt: new Date().toISOString(),
      prStatus: body.prStatus || 'none',
      prUrl: body.prUrl || null,
    };
    dbState.tickets.push(newTicket);
    return jsonResponse(201, newTicket);
  }

  if (url.match(/\/api\/v1\/tickets\/[^\/]+$/) && method === 'PATCH') {
    const ticketId = url.split('/').pop();
    const ticket = dbState.tickets.find(t => t.id === ticketId);
    if (ticket) {
      Object.assign(ticket, body);
      return jsonResponse(200, ticket);
    }
    return jsonResponse(404, { error: 'Ticket not found' });
  }

  // --- USERS ---
  if (url === '/api/v1/users' && method === 'GET') {
    return jsonResponse(200, dbState.currentUser ? [dbState.currentUser] : []);
  }

  // --- WORKSPACE MEMBERS / INVITES / JOIN REQUESTS ---
  if (url.includes('/settings') && method === 'GET') {
    return jsonResponse(200, {
      id: `set-${Date.now()}`,
      workspaceId: url.split('/')[4],
      allowPeerInvites: true,
      requireJoinApproval: false,
    });
  }

  if (url.includes('/members') && method === 'GET') {
    return jsonResponse(200, dbState.currentUser ? [{
      id: `mem-${Date.now()}`,
      userId: dbState.currentUser.id,
      role: 'owner',
      user: dbState.currentUser,
    }] : []);
  }

  if (url.includes('/peer-invites') && method === 'GET') {
    return jsonResponse(200, []);
  }

  if (url.includes('/join-requests') && method === 'GET') {
    return jsonResponse(200, []);
  }

  if (url.includes('/federation/connections') && method === 'GET') {
    return jsonResponse(200, []);
  }

  // Fallback
  return jsonResponse(404, { error: 'Mock endpoint not found' });
}) as any;

// Mock EventSource for SSE
class MockEventSource {
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  constructor(public url: string) {}
  close() {}
}
globalThis.EventSource = MockEventSource as any;
