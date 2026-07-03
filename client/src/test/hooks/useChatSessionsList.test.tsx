import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useChatSessionsList } from '../../modules/chats/hooks/useChatSessionsList';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function makeSession(overrides: Partial<{ id: string; title: string; updatedAt: string }> = {}) {
  return {
    id: 'chat-1',
    projectId: 'project-1',
    teamId: 'team-1',
    userId: 'user-1',
    title: 'New Chat',
    lastMessagePreview: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useChatSessionsList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists chat sessions for the active project', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([makeSession({ id: 'chat-1' }), makeSession({ id: 'chat-2' })]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatSessionsList('project-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/projects/project-1/chats?limit=20&offset=0'),
      expect.anything()
    );
  });

  it('debounces the search input before requesting a filtered list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([makeSession({ id: 'chat-1' })]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatSessionsList('project-1'), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setSearchValue('roadmap');
    });

    // Not yet debounced.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('search=roadmap'),
        expect.anything()
      );
    });
  });

  it('fetches the next page and appends sessions', async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => makeSession({ id: `chat-${i}` }));
    const secondPage = [makeSession({ id: 'chat-20' })];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(firstPage))
      .mockResolvedValueOnce(jsonResponse(secondPage));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatSessionsList('project-1'), { wrapper });

    await waitFor(() => expect(result.current.sessions).toHaveLength(20));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(21));
  });

  it('creates a session and refreshes the list', async () => {
    const created = makeSession({ id: 'chat-new', title: 'New Chat' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse([created]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatSessionsList('project-1'), { wrapper });
    await waitFor(() => expect(result.current.sessions).toHaveLength(0));

    let createdSession;
    await act(async () => {
      createdSession = await result.current.createSession();
    });

    expect(createdSession).toMatchObject({ id: 'chat-new' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/project-1/chats',
      expect.objectContaining({ method: 'POST' })
    );

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
  });
});
