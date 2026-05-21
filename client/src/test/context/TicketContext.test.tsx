import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketProvider, useTickets } from '../../context/TicketContext.tsx';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ContextProbe() {
  const { currentUser, loading } = useTickets();

  return (
    <div>
      <div data-testid="loading-state">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user-email">{currentUser?.email ?? 'anonymous'}</div>
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
    const EventSourceMock = vi.fn(() => ({
      close,
      onmessage: null,
    }));

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
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
});