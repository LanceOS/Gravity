import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

describe('useWorkspaceSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('authenticates join-request approvals with the active user header', async () => {
    const currentUser = {
      id: 'owner-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };

    const approveCalls: RequestInit[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/settings')) {
        return jsonResponse({ workspaceId: 'workspace-1', key: 'GRA', hostUrl: '', joinMode: 'approval_required', workspaceKey: '', disabledMcpTools: [] });
      }

      if (url.endsWith('/members')) {
        return jsonResponse([]);
      }

      if (url.endsWith('/invites')) {
        return jsonResponse([]);
      }

      if (url.endsWith('/join-requests')) {
        return jsonResponse([]);
      }

      if (url.endsWith('/join-requests/request-1/approve')) {
        approveCalls.push(init ?? {});
        return jsonResponse({ id: 'request-1', status: 'approved', reviewedBy: currentUser.id, reviewedAt: '2026-05-25T00:00:00.000Z' });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() =>
      useWorkspaceSettings({
        currentUser,
        activeWorkspaceId: 'workspace-1',
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.settingsLoading).toBe(false);
    });

    let approved = false;
    await act(async () => {
      approved = await result.current.approveJoinRequest('request-1');
    });

    expect(approved).toBe(true);
    expect(approveCalls).toHaveLength(1);
    expect(getHeader(approveCalls[0].headers, 'X-User-Id')).toBe(currentUser.id);
    expect(getHeader(approveCalls[0].headers, 'Content-Type')).toBe('application/json');
    expect(approveCalls[0].body).toBeUndefined();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(9);
    });
  });

  it('keeps member settings visible when join-request loading is forbidden', async () => {
    const currentUser = {
      id: 'member-1',
      name: 'Morgan Lee',
      email: 'morgan@example.com',
      avatar: '',
      role: 'member',
      tutorial_completed: 1,
    };

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/settings')) {
        return jsonResponse({ workspaceId: 'workspace-1', key: 'GRA', hostUrl: 'http://localhost:8080', joinMode: 'approval_required', workspaceKey: 'PRIVATE', disabledMcpTools: [] });
      }

      if (url.endsWith('/members')) {
        return jsonResponse([
          {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            avatar: currentUser.avatar,
            role: 'member',
            createdAt: '2026-05-01T00:00:00.000Z',
            lastActiveAt: null,
          },
        ]);
      }

      if (url.endsWith('/invites')) {
        return jsonResponse([]);
      }

      if (url.endsWith('/join-requests')) {
        return jsonResponse({ error: 'Owner or admin access is required.' }, 403);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() =>
      useWorkspaceSettings({
        currentUser,
        activeWorkspaceId: 'workspace-1',
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.settingsLoading).toBe(false);
      expect(result.current.settings.workspaceId).toBe('workspace-1');
    });

    expect(result.current.saveError).toBeNull();
    expect(result.current.members).toEqual([
      expect.objectContaining({
        id: currentUser.id,
        email: currentUser.email,
      }),
    ]);
    expect(result.current.invites).toEqual([]);
    expect(result.current.joinRequests).toEqual([]);
  });

  it('resets settings to defaults when the active workspace refresh fails', async () => {
    const currentUser = {
      id: 'owner-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/workspaces/workspace-1/settings')) {
        return jsonResponse({ workspaceId: 'workspace-1', key: 'GRA', hostUrl: 'http://localhost:8080', joinMode: 'approval_required', workspaceKey: 'PRIVATE', disabledMcpTools: [] });
      }

      if (url.endsWith('/workspaces/workspace-2/settings')) {
        return jsonResponse({ error: 'Failed to load workspace settings.' }, 500);
      }

      if (url.endsWith('/members') || url.endsWith('/invites') || url.endsWith('/join-requests')) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ activeWorkspaceId }) =>
        useWorkspaceSettings({
          currentUser,
          activeWorkspaceId,
        }),
      { initialProps: { activeWorkspaceId: 'workspace-1' }, wrapper }
    );

    await waitFor(() => {
      expect(result.current.settings.workspaceId).toBe('workspace-1');
      expect(result.current.settings.key).toBe('GRA');
    });

    rerender({ activeWorkspaceId: 'workspace-2' });

    await waitFor(() => {
      expect(result.current.settingsLoading).toBe(false);
      expect(result.current.saveError).toBe('Failed to load workspace settings.');
    });

    expect(result.current.settings).toEqual({
      workspaceId: 'workspace-2',
      key: '',
      hostUrl: '',
      joinMode: 'approval_required',
      workspaceKey: '',
      disabledMcpTools: [],
    });
    expect(result.current.members).toEqual([]);
    expect(result.current.invites).toEqual([]);
    expect(result.current.joinRequests).toEqual([]);
  });

  it('ignores late refresh responses from a previously selected workspace', async () => {
    const currentUser = {
      id: 'owner-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const firstSettingsResponse = createDeferred<Response>();

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/workspaces/workspace-1/settings')) {
        return firstSettingsResponse.promise;
      }

      if (url.endsWith('/workspaces/workspace-2/settings')) {
        return Promise.resolve(jsonResponse({ workspaceId: 'workspace-2', key: 'OPS', hostUrl: 'http://localhost:9090', joinMode: 'auto_join', workspaceKey: 'OPS-KEY', disabledMcpTools: ['tool-a'] }));
      }

      if (url.includes('/workspaces/workspace-1/') || url.includes('/workspaces/workspace-2/')) {
        return Promise.resolve(jsonResponse([]));
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ activeWorkspaceId }) =>
        useWorkspaceSettings({
          currentUser,
          activeWorkspaceId,
        }),
      { initialProps: { activeWorkspaceId: 'workspace-1' }, wrapper }
    );

    rerender({ activeWorkspaceId: 'workspace-2' });

    await waitFor(() => {
      expect(result.current.settings.workspaceId).toBe('workspace-2');
      expect(result.current.settings.key).toBe('OPS');
      expect(result.current.settings.joinMode).toBe('auto_join');
    });

    await act(async () => {
      firstSettingsResponse.resolve(jsonResponse({ workspaceId: 'workspace-1', key: 'GRA', hostUrl: 'http://localhost:8080', joinMode: 'approval_required', workspaceKey: 'GRA-KEY', disabledMcpTools: [] }));
      await Promise.resolve();
    });

    expect(result.current.settings.workspaceId).toBe('workspace-2');
    expect(result.current.settings.key).toBe('OPS');
    expect(result.current.settings.hostUrl).toBe('http://localhost:9090');
  });
});