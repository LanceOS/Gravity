import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  currentUser: null as { id: string } | null,
  loaded: new Set<string>(),
}));

vi.mock('../context/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: state.currentUser, loading: false }),
}));
vi.mock('../context/TicketContext', () => ({
  ProjectContextProviders: ({ children }: { children: ReactNode }) => children,
  WorkspaceTicketProviders: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../modules/auth', () => ({ AuthScreen: () => <div>Sign in</div> }));
vi.mock('../pages/AppShellPage/AppShellPage', () => {
  state.loaded.add('directory');
  return { AppShellPage: () => <div>Workspace directory</div> };
});
vi.mock('../pages/WorkspaceShellPage/WorkspaceShellPage', () => {
  state.loaded.add('workspace');
  return { WorkspaceShellPage: () => <div>Workspace tickets</div> };
});
vi.mock('../pages/AccountPreferencesPage/AccountPreferencesPage', () => {
  state.loaded.add('account');
  return { AccountPreferencesPageRoute: () => <div>Account settings</div> };
});
vi.mock('../pages/WorkspaceSettingsPage/WorkspaceSettingsPage', () => {
  state.loaded.add('settings');
  return { WorkspaceSettingsPageRoute: () => <div>Workspace settings</div> };
});

import { router } from './index';

let testRouter: ReturnType<typeof createMemoryRouter> | undefined;

afterEach(() => {
  testRouter?.dispose();
  state.currentUser = null;
});

describe('lazy protected routes', () => {
  it('loads screens only after authentication and when their route is visited', async () => {
    testRouter = createMemoryRouter(router.routes, { initialEntries: ['/workspaces'] });
    render(<RouterProvider router={testRouter} />);

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect([...state.loaded]).toEqual([]);

    state.currentUser = { id: 'user-1' };
    await act(async () => { await testRouter!.navigate('/'); });
    expect(await screen.findByText('Workspace directory')).toBeInTheDocument();
    expect([...state.loaded]).toEqual(['directory']);

    await act(async () => { await testRouter!.navigate('/workspaces/ws-1/projects/project-1/tickets'); });
    expect(await screen.findByText('Workspace tickets')).toBeInTheDocument();
    expect([...state.loaded]).toEqual(['directory', 'workspace']);

    await act(async () => { await testRouter!.navigate('/account'); });
    expect(await screen.findByText('Account settings')).toBeInTheDocument();
    expect(state.loaded.has('settings')).toBe(false);

    await act(async () => { await testRouter!.navigate('/workspaces/ws-1/settings'); });
    expect(await screen.findByText('Workspace settings')).toBeInTheDocument();
    expect([...state.loaded]).toEqual(['directory', 'workspace', 'account', 'settings']);
  });
});
