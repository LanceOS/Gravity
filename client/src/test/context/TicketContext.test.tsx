import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketProvider } from '../../context/TicketContext.tsx';
import { useTickets } from '../../context/TicketContextContext';
import { useActiveProject } from '../../context/project/ActiveProjectContext';
import { ActiveProjectProvider } from '../../context/project/ActiveProjectContext';
import { useProjectContext } from '../../context/project/ProjectContext';
import { useTicketDetailContext } from '../../context/ticket/TicketDetailContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWithProvider(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveProjectProvider>
        {ui}
      </ActiveProjectProvider>
    </QueryClientProvider>
  );
}

function ContextProbe() {
  const { loading, users, tickets } = useTickets();
  const { projects } = useProjectContext();
  const { activeProjectId, setActiveProjectId } = useActiveProject();

  const currentUser: any = { email: 'ada@example.com' };
  const switchUser = () => { };



  return (
    <div>
      <div data-testid="loading-state">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user-email">{currentUser?.email ?? 'anonymous'}</div>
      <div data-testid="project-count">{projects.length}</div>
      <div data-testid="user-count">{users.length}</div>
      <div data-testid="ticket-count">{tickets.length}</div>
      <div data-testid="active-project-id">{activeProjectId || 'none'}</div>
      <div data-testid="ticket-titles">{tickets.map((ticket) => ticket.title).join('|')}</div>
      <div data-testid="ticket-statuses">{tickets.map((ticket) => ticket.status).join('|')}</div>
      <button type="button" onClick={switchUser}>Switch user</button>
      <button type="button" onClick={() => setActiveProjectId('project-1')}>Select project 1</button>
      <button type="button" onClick={() => setActiveProjectId('project-2')}>Switch project</button>
    </div>
  );
}

function RelationProbe() {
  const {
    activeTicket,
    tickets,
    setActiveTicket,
    addTicketDependency,
    removeTicketDependency,
  } = useTickets();
  const { activeTicketDetail } = useTicketDetailContext();
  const { setActiveProjectId } = useActiveProject();

  const currentUser: any = { id: 'user-1' };

  React.useEffect(() => {
    if (currentUser) {
      setActiveProjectId('project-1');
    }
  }, [currentUser, setActiveProjectId]);

  React.useEffect(() => {
    const ticket = tickets.find((item) => item.id === 'ticket-1');
    if (ticket && activeTicket?.id !== ticket.id) {
      setActiveTicket(ticket);
    }
  }, [activeTicket?.id, setActiveTicket, tickets]);

  return (
    <div>
      <div data-testid="dependency-keys">
        {activeTicketDetail?.dependencies?.map((ticket) => ticket.key).join('|') ?? ''}
      </div>
      <button
        type="button"
        disabled={!activeTicket}
        onClick={() => {
          void addTicketDependency('ticket-1', 'ticket-2');
        }}
      >
        Add dependency
      </button>
      <button
        type="button"
        disabled={!activeTicket}
        onClick={() => {
          void removeTicketDependency('ticket-1', 'ticket-2');
        }}
      >
        Remove dependency
      </button>
    </div>
  );
}

describe('TicketContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  function stubEventSource() {
    const close = vi.fn();
    const EventSourceMock = vi.fn().mockImplementation(function () {
      return {
        close,
        onmessage: null,
      };
    });

    vi.stubGlobal('EventSource', EventSourceMock);
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      writable: true,
      value: EventSourceMock,
    });
    return { EventSourceMock, close };
  }

  it.skip('restores the signed-in user from the server session before loading workspace data', async () => {
    const user = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const fetchMock = vi.fn((url, init) => {
      console.log('fetchMock called with:', url, init);
      if (url === '/api/auth/session') {
        return Promise.resolve(jsonResponse({ user, session: { userId: user.id } }));
      }
      if (url.includes('/projects')) {
        return Promise.resolve(jsonResponse([
          {
            id: 'project-1',
            workspaceId: 'workspace-1',
            name: 'Workspace Project',
            description: '',
            key: 'WS1',
            status: 'active',
          },
        ]));
      }
      if (url.includes('/users')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse([]));
    });

    const { EventSourceMock } = stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    expect(screen.getByTestId('loading-state')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('ada@example.com');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/session', { credentials: 'same-origin' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/projects?userId=${encodeURIComponent(user.id)}`, expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/users', expect.any(Object));
    expect(EventSourceMock).toHaveBeenCalledWith('/api/v1/events/subscribe?workspaceId=workspace-1', { withCredentials: true });
    expect(window.localStorage.getItem('gravity_user')).toContain(user.id);
  });

  it.skip('clears stale local storage when no server session exists', async () => {
    window.localStorage.setItem(
      'gravity_user',
      JSON.stringify({
        id: 'stale-user',
        name: 'Stale User',
        email: 'stale@example.com',
        avatar: '',
        role: 'member',
      })
    );

    const fetchMock = vi.fn((url) => {
      if (url.includes('/session')) {
        return Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
      }
      return Promise.resolve(jsonResponse([]));
    });
    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('anonymous');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.any(Object));
    expect(window.localStorage.getItem('gravity_user')).toBeNull();
  });

  it.skip('keeps the cached user while session bootstrap fails transiently', async () => {
    const user = {
      id: 'cached-user-1',
      name: 'Cached User',
      email: 'cached@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    window.localStorage.setItem('gravity_user', JSON.stringify(user));

    const fetchMock = vi.fn().mockRejectedValue(new Error('backend unavailable'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('cached@example.com');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { credentials: 'same-origin' });
    expect(window.localStorage.getItem('gravity_user')).toContain(user.id);
    consoleErrorSpy.mockRestore();
  });

  it.skip('keeps bootstrap collections as arrays when the initial workspace fetch fails', async () => {
    const user = {
      id: 'user-session-2',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user, session: { userId: user.id } }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required.' }, 401))
      .mockResolvedValueOnce(jsonResponse([]));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('grace@example.com');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('project-count')).toHaveTextContent('0');
    expect(screen.getByTestId('user-count')).toHaveTextContent('0');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication required.',
        status: 401,
      })
    );

    consoleErrorSpy.mockRestore();
  });

  it.skip('clears prior workspace data before a different user refetch fails', async () => {
    const firstUser = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user: firstUser, session: { userId: firstUser.id } }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', avatar: '', role: 'owner' }]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required.' }, 401))
      .mockResolvedValueOnce(jsonResponse([]));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    const user = await import('@testing-library/user-event').then((module) => module.default.setup());

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await user.click(await screen.findByRole('button', { name: 'Select project 1' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-count')).toHaveTextContent('1');
      expect(screen.getByTestId('user-count')).toHaveTextContent('1');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    await user.click(screen.getByRole('button', { name: 'Switch user' }));

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('katherine@example.com');
      expect(screen.getByTestId('project-count')).toHaveTextContent('0');
      expect(screen.getByTestId('user-count')).toHaveTextContent('0');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Authentication required.',
        status: 401,
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it.skip('clears prior project data before a different project fetch fails', async () => {
    const user = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user, session: { userId: user.id } }))
      .mockResolvedValueOnce(jsonResponse([
        { id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' },
        { id: 'project-2', name: 'Agent Ops', description: '', key: 'OPS', status: 'active', workspaceId: 'workspace-1' },
      ]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 'ticket-1',
          key: 'GRA-1',
          title: 'Seed project data',
          description: '',
          status: 'todo',
          priority: 'medium',
          projectId: 'project-1',
          domainId: null,
          cycleId: null,
          assigneeId: null,
          parentId: null,
          prStatus: 'none',
          prUrl: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: 'Project load failed.' }, 500))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    const userEvent = await import('@testing-library/user-event').then((module) => module.default.setup());

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Select project 1' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Switch project' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('0');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Project load failed.',
        status: 500,
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it.skip('falls back to the created ticket when the post-create refresh payload is invalid', async () => {
    const user = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const createdTicket = {
      id: 'ticket-2',
      key: 'GRA-2',
      title: 'Created ticket',
      description: '',
      status: 'todo',
      priority: 'medium',
      projectId: 'project-1',
      domainId: null,
      cycleId: null,
      assigneeId: null,
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-02T00:00:00.000Z',
    };
    let createdTicketPosted = false;
    let refreshShouldFail = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/auth/session') {
        return jsonResponse({ user, session: { userId: user.id } });
      }

      if (url === '/api/v1/projects?userId=user-session-1') {
        return jsonResponse([{ id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' }]);
      }

      if (url === '/api/v1/users') {
        return jsonResponse([]);
      }

      if (url === '/api/v1/tickets' && method === 'GET') {
        if (!createdTicketPosted) {
          return jsonResponse([]);
        }

        if (refreshShouldFail) {
          return jsonResponse({ error: 'gateway down' }, 502);
        }

        return jsonResponse([]);
      }

      if (url === '/api/v1/tickets' && method === 'POST') {
        createdTicketPosted = true;
        refreshShouldFail = true;
        return jsonResponse(createdTicket);
      }

      return jsonResponse([]);
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    const userEvent = await import('@testing-library/user-event').then((module) => module.default.setup());

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Select project 1' }));

    await waitFor(() => {
      expect(screen.getByTestId('active-project-id')).toHaveTextContent('project-1');
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('0');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
      expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Created ticket');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'gateway down',
        status: 502,
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it.skip('optimistically updates ticket dependencies while the server request runs in the background', async () => {
    const user = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const sourceTicket = {
      id: 'ticket-1',
      key: 'GRA-1',
      title: 'Seed ticket',
      description: '',
      status: 'todo',
      priority: 'medium',
      projectId: 'project-1',
      domainId: null,
      cycleId: null,
      assigneeId: null,
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    const dependencyTicket = {
      ...sourceTicket,
      id: 'ticket-2',
      key: 'GRA-2',
      title: 'Dependency target',
    };
    const pendingRequests: {
      resolveDetailRequest?: (response: Response) => void;
      resolveDependencyPost?: (response: Response) => void;
    } = {};

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/auth/session') {
        return Promise.resolve(jsonResponse({ user, session: { userId: user.id } }));
      }

      if (url === '/api/v1/projects?userId=user-session-1') {
        return Promise.resolve(jsonResponse([{ id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' }]));
      }

      if (url === '/api/v1/users' || url === '/api/v1/labels' || url === '/api/v1/cycles') {
        return Promise.resolve(jsonResponse([]));
      }

      if (url === '/api/v1/tickets' && method === 'GET') {
        return Promise.resolve(jsonResponse([sourceTicket, dependencyTicket]));
      }

      if (url === '/api/v1/tickets/ticket-1' && method === 'GET') {
        return new Promise<Response>((resolve) => {
          pendingRequests.resolveDetailRequest = resolve;
        });
      }

      if (url === '/api/v1/tickets/ticket-1/dependencies' && method === 'POST') {
        return new Promise<Response>((resolve) => {
          pendingRequests.resolveDependencyPost = resolve;
        });
      }

      return Promise.resolve(jsonResponse([]));
    });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(
      <TicketProvider>
        <RelationProbe />
      </TicketProvider>
    );

    const addButton = await screen.findByRole('button', { name: 'Add dependency' });
    await waitFor(() => expect(addButton).not.toBeDisabled());

    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('dependency-keys')).toHaveTextContent('GRA-2');
    });
    await waitFor(() => {
      expect(pendingRequests.resolveDependencyPost).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove dependency' }));
    expect(screen.getByTestId('dependency-keys')).toHaveTextContent('GRA-2');
    expect(fetchMock.mock.calls.some(([url, init]) => (
      String(url) === '/api/v1/tickets/ticket-1/dependencies/ticket-2' && init?.method === 'DELETE'
    ))).toBe(false);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/tickets/ticket-1/dependencies',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ dependencyId: 'ticket-2' }),
      })
    );

    pendingRequests.resolveDetailRequest?.(jsonResponse({ ...sourceTicket, dependencies: [], blockers: [] }));
    await Promise.resolve();
    expect(screen.getByTestId('dependency-keys')).toHaveTextContent('GRA-2');

    pendingRequests.resolveDependencyPost?.(jsonResponse({ success: true }, 201));
  });

  it.skip('rolls back to the original tickets when update rollback refresh fails', async () => {
    const user = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user, session: { userId: user.id } }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' }]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 'ticket-1',
          key: 'GRA-1',
          title: 'Seed ticket',
          description: '',
          status: 'todo',
          priority: 'medium',
          projectId: 'project-1',
          domainId: null,
          cycleId: null,
          assigneeId: null,
          parentId: null,
          prStatus: 'none',
          prUrl: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: 'update failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: 'refresh failed' }, 502));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    const userEvent = await import('@testing-library/user-event').then((module) => module.default.setup());

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Select project 1' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
      expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Seed ticket');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Update first ticket' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Seed ticket');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error updating ticket on server, rolling back:', expect.any(Error));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'refresh failed',
        status: 502,
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it.skip('batches rapid ticket updates into a single patch request', async () => {
    const user = {
      id: 'user-session-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user, session: { userId: user.id } }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' }]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 'ticket-1',
          key: 'GRA-1',
          title: 'Seed ticket',
          description: '',
          status: 'todo',
          priority: 'medium',
          projectId: 'project-1',
          domainId: null,
          cycleId: null,
          assigneeId: null,
          parentId: null,
          prStatus: 'none',
          prUrl: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({
        id: 'ticket-1',
        key: 'GRA-1',
        title: 'Updated ticket',
        description: '',
        status: 'done',
        priority: 'medium',
        projectId: 'project-1',
        domainId: null,
        cycleId: null,
        assigneeId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }));

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Select project 1' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update first ticket' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark first ticket done' }));

    expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Updated ticket');
    expect(screen.getByTestId('ticket-statuses')).toHaveTextContent('done');

    const patchCallsBeforeFlush = fetchMock.mock.calls.filter(([url, init]) => url === '/api/v1/tickets/ticket-1' && init?.method === 'PATCH');
    expect(patchCallsBeforeFlush).toHaveLength(0);

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(([url, init]) => url === '/api/v1/tickets/ticket-1' && init?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);

      const [, patchInit] = patchCalls[0];
      expect(JSON.parse(patchInit?.body as string)).toEqual({ title: 'Updated ticket', status: 'done' });
    });
  });
});
