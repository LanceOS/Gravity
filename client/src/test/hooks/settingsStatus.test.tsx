import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from '@library';
import { apiClient } from '../../utils/apiClient';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { useAccountSettings } from '../../hooks/useAccountSettings';

vi.mock('@library', () => ({ toast: { show: vi.fn() } }));
vi.mock('../../utils/apiClient', async importOriginal => ({ ...await importOriginal<typeof import('../../utils/apiClient')>(), apiClient: { get: vi.fn(), patch: vi.fn() } }));
const user = { id: 'status-user', name: 'User', email: 'u@example.com', avatar: '', role: 'owner', tutorial_completed: 1 };
const workspace = { workspaceId: 'status-workspace', key: 'S', hostUrl: '', joinMode: 'approval_required', hierarchyMode: 'flat', workspaceKey: 'key', disabledMcpTools: [] };
const account = { defaultView: 'board', theme: 'dark', projectLayout: 'standard', aiProvider: 'openai', apiKey: '', savedCredentials: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => vi.clearAllMocks());

describe('settings persistence status', () => {
  it('retains disabled credential availability while saving unrelated preferences', async () => {
    const disabled = { ...account, encryptedCredentialsAvailable: false };
    vi.mocked(apiClient.get).mockResolvedValue(disabled);
    const setTheme = vi.fn(); const setView = vi.fn();
    const { result } = renderHook(() => useAccountSettings({ currentUser: user, activeView: 'board', theme: 'dark', setTheme, setView }));
    await waitFor(() => expect(result.current.settingsHydrated).toBe(true));
    expect(result.current.settings.encryptedCredentialsAvailable).toBe(false);
    act(() => result.current.updateSettings({ defaultView: 'list' }));
    vi.mocked(apiClient.patch).mockResolvedValue({ ...disabled, defaultView: 'list' });
    await act(async () => { await result.current.saveSettings(); });
    expect(result.current.settings.encryptedCredentialsAvailable).toBe(false);
    expect(result.current.settings.defaultView).toBe('list');
    expect(result.current.hasChanges).toBe(false);
  });

  it('keeps workspace edits on failure, permits retry, then becomes clean after confirmation', async () => {
    vi.mocked(apiClient.get).mockImplementation(async path => path.endsWith('/settings') ? { ...workspace } : [] as any);
    const client = new QueryClient();
    const { result } = renderHook(() => useWorkspaceSettings({ currentUser: user, activeWorkspaceId: workspace.workspaceId }), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.settingsLoading).toBe(false));
    expect(result.current.hasChanges).toBe(false);
    act(() => result.current.updateSettings({ hostUrl: 'https://new.example' }));
    const request = deferred<any>();
    vi.mocked(apiClient.patch).mockReturnValueOnce(request.promise);
    let running!: Promise<void>;
    act(() => { running = result.current.saveSettings(); });
    expect(result.current.saveLoading).toBe(true);
    await act(async () => { await result.current.saveSettings(); });
    expect(apiClient.patch).toHaveBeenCalledTimes(1);
    expect(toast.show).not.toHaveBeenCalled();
    await act(async () => { request.reject(new Error('Offline')); await running; });
    expect(result.current.settings.hostUrl).toBe('https://new.example');
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.saveLoading).toBe(false);
    await act(async () => { await result.current.refreshWorkspaceAdmin(); });
    expect(result.current.settings.hostUrl).toBe('https://new.example');
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ ...workspace, hostUrl: 'https://new.example' });
    await act(async () => { await result.current.saveSettings(); });
    await waitFor(() => expect(result.current.hasChanges).toBe(false));
    expect(toast.show).toHaveBeenLastCalledWith('Workspace settings saved.', 'success');
    act(() => result.current.updateSettings({ hostUrl: 'https://next.example' }));
    expect(result.current.hasChanges).toBe(true);
  });

  it('preserves account edits typed during a save and acknowledges only the submitted draft', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(account);
    const setTheme = vi.fn(); const setView = vi.fn();
    const { result } = renderHook(() => useAccountSettings({ currentUser: user, activeView: 'board', theme: 'dark', setTheme, setView }));
    await waitFor(() => expect(result.current.settingsHydrated).toBe(true));
    act(() => result.current.updateSettings({ defaultView: 'list' }));
    const request = deferred<any>();
    vi.mocked(apiClient.patch).mockReturnValueOnce(request.promise);
    let running!: Promise<void>;
    act(() => { running = result.current.saveSettings(); });
    await act(async () => { await result.current.saveSettings(); });
    expect(apiClient.patch).toHaveBeenCalledTimes(1);
    act(() => result.current.updateSettings({ theme: 'coffee' }));
    await act(async () => { request.resolve({ ...account, defaultView: 'list' }); await running; });
    expect(result.current.settings.theme).toBe('coffee');
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.saveLoading).toBe(false);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Account settings saved.', 'success');
  });
});


it('refreshes workspace settings after all local edits have been reverted', async () => {
  vi.mocked(apiClient.get).mockImplementation(async path => path.endsWith('/settings') ? { ...workspace } : [] as any);
  const client = new QueryClient();
  const { result } = renderHook(() => useWorkspaceSettings({ currentUser: user, activeWorkspaceId: workspace.workspaceId }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.settingsLoading).toBe(false));
  act(() => result.current.updateSettings({ hostUrl: 'https://draft.example' }));
  act(() => result.current.updateSettings({ hostUrl: '' }));
  expect(result.current.hasChanges).toBe(false);
  vi.mocked(apiClient.get).mockImplementation(async path => path.endsWith('/settings') ? { ...workspace, hostUrl: 'https://server.example' } : [] as any);
  await act(async () => { await result.current.refreshWorkspaceAdmin(); });
  expect(result.current.settings.hostUrl).toBe('https://server.example');
  expect(result.current.hasChanges).toBe(false);
});

it('preserves a workspace revert made while a different value is being saved', async () => {
  vi.mocked(apiClient.get).mockImplementation(async path => path.endsWith('/settings') ? { ...workspace } : [] as any);
  const client = new QueryClient();
  const { result } = renderHook(() => useWorkspaceSettings({ currentUser: user, activeWorkspaceId: workspace.workspaceId }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.settingsLoading).toBe(false));
  act(() => result.current.updateSettings({ hostUrl: 'https://submitted.example' }));
  const request = deferred<any>();
  vi.mocked(apiClient.patch).mockReturnValueOnce(request.promise);
  let running!: Promise<void>;
  act(() => { running = result.current.saveSettings(); });
  act(() => result.current.updateSettings({ hostUrl: '' }));
  await act(async () => { request.resolve({ ...workspace, hostUrl: 'https://submitted.example' }); await running; });
  expect(result.current.settings.hostUrl).toBe('');
  expect(result.current.hasChanges).toBe(true);
});

it.each([false, true])('confirms the saved API key while preserving newer credential edits: %s', async editKey => {
  vi.mocked(apiClient.get).mockResolvedValue(account);
  const setTheme = vi.fn(); const setView = vi.fn();
  const { result } = renderHook(() => useAccountSettings({ currentUser: user, activeView: 'board', theme: 'dark', setTheme, setView }));
  await waitFor(() => expect(result.current.settingsHydrated).toBe(true));
  act(() => result.current.updateSettings({ apiKey: 'test-key' }));
  const request = deferred<any>();
  vi.mocked(apiClient.patch).mockReturnValueOnce(request.promise);
  let running!: Promise<void>;
  act(() => { running = result.current.saveSettings(); });
  act(() => result.current.updateSettings({ theme: 'coffee' }));
  if (editKey) act(() => result.current.updateSettings({ apiKey: 'newer-key' }));
  await act(async () => { request.resolve({ ...account, apiKey: '••••••••••••' }); await running; });
  expect(result.current.settings.theme).toBe('coffee');
  expect(result.current.hasChanges).toBe(true);
  expect(result.current.hasProviderChanges).toBe(editKey);
  expect(result.current.settings.apiKey).toBe(editKey ? 'newer-key' : '••••••••••••');
});
