import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/queryClient';
import { CommentContextType } from '../CommentContext.types';
import { useCommentContextValue } from '../CommentContext';
import type { Comment, User } from '../../../types/domain';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

let currentActions: CommentContextType | undefined;

function Probe({
  currentUser,
  activeProjectIdRef,
}: {
  currentUser: Pick<User, 'id' | 'name' | 'avatar' | 'role'> | null;
  activeProjectIdRef: React.MutableRefObject<string>;
}) {
  const actions = useCommentContextValue({
    currentUser,
    activeProjectIdRef,
  });

  React.useEffect(() => {
    currentActions = actions;
  }, [actions]);

  return null;
}

describe('CommentContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    currentActions = undefined as unknown as CommentContextType;
  });

  it('optimistically inserts a comment and replaces the synthetic entry with the server payload', async () => {
    const queryClient = createQueryClient();
    const activeProjectIdRef = { current: 'project-1' };
    const currentUser = {
      id: 'user-1',
      name: 'Ada Lovelace',
      avatar: 'https://example.com/ada.png',
      role: 'owner',
    };
    queryClient.setQueryData<Comment[]>(queryKeys.comments('ticket-1'), []);

    let resolvePost: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolvePost = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe currentUser={currentUser} activeProjectIdRef={activeProjectIdRef} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentActions).toBeDefined();
    });

    let pendingAdd: Promise<void> | undefined;
    act(() => {
      pendingAdd = currentActions!.addComment('ticket-1', '<p>First note</p>');
    });

    await waitFor(() => {
      const comments = queryClient.getQueryData<Comment[]>(queryKeys.comments('ticket-1')) ?? [];
      expect(comments).toHaveLength(1);
      expect(comments[0].id).toMatch(/^co-opt-/);
      expect(comments[0].body).toBe('<p>First note</p>');
    });

    await waitFor(() => {
      expect(resolvePost).toBeDefined();
    });

    resolvePost?.(jsonResponse({
      id: 'comment-1',
      ticketId: 'ticket-1',
      userId: 'user-1',
      body: '<p>First note</p>',
      createdAt: '2026-06-19T12:00:00.000Z',
      updatedAt: '2026-06-19T12:00:00.000Z',
      userName: 'Ada Lovelace',
      userAvatar: 'https://example.com/ada.png',
      author: {
        id: 'user-1',
        username: 'Ada Lovelace',
        avatar_url: 'https://example.com/ada.png',
        role: 'owner',
      },
    }));

    await pendingAdd!;

    const comments = queryClient.getQueryData<Comment[]>(queryKeys.comments('ticket-1')) ?? [];
    expect(comments).toEqual([
      expect.objectContaining({
        id: 'comment-1',
        ticketId: 'ticket-1',
        body: '<p>First note</p>',
        updatedAt: '2026-06-19T12:00:00.000Z',
      }),
    ]);
  });

  it('rolls back an optimistic update when the server rejects the patch', async () => {
    const queryClient = createQueryClient();
    const activeProjectIdRef = { current: 'project-1' };
    const currentUser = {
      id: 'user-1',
      name: 'Ada Lovelace',
      avatar: '',
      role: 'owner',
    };
    const originalComment: Comment = {
      id: 'comment-1',
      ticketId: 'ticket-1',
      userId: 'user-1',
      body: 'Original body',
      createdAt: '2026-06-18T12:00:00.000Z',
      updatedAt: '2026-06-18T12:00:00.000Z',
    };
    queryClient.setQueryData<Comment[]>(queryKeys.comments('ticket-1'), [originalComment]);

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'update failed' }, 500)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe currentUser={currentUser} activeProjectIdRef={activeProjectIdRef} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentActions).toBeDefined();
    });

    await expect(currentActions!.updateComment('ticket-1', 'comment-1', 'Updated body')).rejects.toMatchObject({
      message: 'update failed',
    });

    const comments = queryClient.getQueryData<Comment[]>(queryKeys.comments('ticket-1')) ?? [];
    expect(comments).toEqual([originalComment]);
  });

  it('rejects unauthenticated comment creation without mutating the cache', async () => {
    const queryClient = createQueryClient();
    const activeProjectIdRef = { current: 'project-1' };
    queryClient.setQueryData<Comment[]>(queryKeys.comments('ticket-1'), []);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe currentUser={null} activeProjectIdRef={activeProjectIdRef} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentActions).toBeDefined();
    });

    await expect(currentActions!.addComment('ticket-1', 'Should fail')).rejects.toMatchObject({
      message: 'Not authenticated',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<Comment[]>(queryKeys.comments('ticket-1'))).toEqual([]);
  });
});
