import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketProvider, useTickets } from '../../context/TicketContext.tsx';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ContextProbe() {
  const {
    activeProjectId,
    currentUser,
    loading,
    projects,
    users,
    tickets,
    createTicket,
    updateTicket,
    setCurrentUser,
    setActiveProjectId,
  } = useTickets();

  const switchUser = () => {
    setCurrentUser({
      id: 'user-session-3',
      name: 'Katherine Johnson',
      email: 'katherine@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    });
  };

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
      <button type="button" onClick={() => setActiveProjectId('project-2')}>Switch project</button>
      <button
        type="button"
        onClick={() => {
          void createTicket({
            title: 'Created ticket',
            description: '',
            status: 'todo',
            priority: 'medium',
            projectId: activeProjectId || projects[0]?.id || 'project-1',
            domainId: null,
            cycleId: null,
            assigneeId: null,
            parentId: null,
          });
        }}
      >
        Create ticket
      </button>
      <button
        type="button"
        onClick={() => {
          if (tickets[0]) {
            void updateTicket(tickets[0].id, { status: 'done' });
          }
        }}
      >
        Mark first ticket done
      </button>
      <button
        type="button"
        onClick={() => {
          if (tickets[0]) {
            void updateTicket(tickets[0].id, { title: 'Updated ticket' });
          }
        }}
      >
        Update first ticket
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

  it('restores the signed-in user from the server session before loading workspace data', async () => {
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
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    const { EventSourceMock } = stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    render(
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
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/projects?userId=${encodeURIComponent(user.id)}`);
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/users');
    expect(EventSourceMock).toHaveBeenCalledWith('/api/v1/events/subscribe');
    expect(window.localStorage.getItem('gravity_user')).toContain(user.id);
  });

  it('clears stale local storage when no server session exists', async () => {
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

    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));
    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('anonymous');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('gravity_user')).toBeNull();
  });

  it('keeps the cached user while session bootstrap fails transiently', async () => {
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

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('cached@example.com');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/session', { credentials: 'same-origin' });
    expect(window.localStorage.getItem('gravity_user')).toContain(user.id);
    consoleErrorSpy.mockRestore();
  });

  it('keeps bootstrap collections as arrays when the initial workspace fetch fails', async () => {
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

    render(
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
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load initial workspace data:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('clears prior workspace data before a different user refetch fails', async () => {
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

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

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

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load initial workspace data:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('clears prior project data before a different project fetch fails', async () => {
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

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Switch project' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('0');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch project data for project project-2:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('falls back to the created ticket when the post-create refresh payload is invalid', async () => {
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
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({
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
      }))
      .mockResolvedValueOnce(jsonResponse({ error: 'gateway down' }, 502));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    stubEventSource();
    vi.stubGlobal('fetch', fetchMock);

    const userEvent = await import('@testing-library/user-event').then((module) => module.default.setup());

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-project-id')).toHaveTextContent('project-1');
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('0');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
      expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Created ticket');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to refresh tickets for project project-1:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('rolls back to the original tickets when update rollback refresh fails', async () => {
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

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ticket-count')).toHaveTextContent('1');
      expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Seed ticket');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Update first ticket' }));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-titles')).toHaveTextContent('Seed ticket');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error updating ticket on server, rolling back:', expect.any(Error));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to refresh tickets for project project-1:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('batches rapid ticket updates into a single patch request', async () => {
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

    render(
      <TicketProvider>
        <ContextProbe />
      </TicketProvider>
    );

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