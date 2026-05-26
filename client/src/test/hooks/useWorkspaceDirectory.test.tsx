import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getHeader(headers: HeadersInit | undefined, name: string) {
  if (!headers) {
    return null;
  }

  const normalizedName = name.toLowerCase();

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (Array.isArray(headers)) {
    const entry = headers.find(([headerName]) => headerName.toLowerCase() === normalizedName);
    return entry?.[1] ?? null;
  }

  const entry = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === normalizedName);
  return entry?.[1] ?? null;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('useWorkspaceDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores stale responses from a previous user refresh', async () => {
    const firstUser = {
      id: 'user-a',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const secondUser = {
      id: 'user-b',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const secondWorkspace = {
      id: 'workspace-b',
      name: 'Grace Space',
      description: 'Second workspace',
      key: 'GRA',
      defaultProjectId: null,
      hostUrl: 'http://localhost:8080',
      joinMode: 'approval_required' as const,
      projectCount: 0,
      memberCount: 1,
      pendingJoinRequestCount: 0,
      memberRole: 'owner',
    };

    const firstResponse = createDeferred<Response>();
    const setCurrentUser = vi.fn();
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const userId = getHeader(init?.headers, 'X-User-Id');

      if (userId === firstUser.id) {
        return firstResponse.promise;
      }

      if (userId === secondUser.id) {
        return Promise.resolve(jsonResponse([secondWorkspace]));
      }

      throw new Error(`Unexpected fetch for user ${String(userId)}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ currentUser }) => useWorkspaceDirectory({ currentUser, setCurrentUser }),
      { initialProps: { currentUser: firstUser } }
    );

    rerender({ currentUser: secondUser });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.resolvedUserId).toBe(secondUser.id);
      expect(result.current.workspaces).toEqual([secondWorkspace]);
    });

    await act(async () => {
      firstResponse.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
      await Promise.resolve();
    });

    expect(setCurrentUser).not.toHaveBeenCalled();
    expect(result.current.resolvedUserId).toBe(secondUser.id);
    expect(result.current.workspaces).toEqual([secondWorkspace]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});