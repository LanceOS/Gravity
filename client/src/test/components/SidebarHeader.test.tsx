import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../../components/Sidebar';

vi.mock('../../components/Sidebar/components', () => ({
  SidebarProjectsSection: () => <div data-testid="sidebar-projects-section" />,
  SidebarUserMenu: () => <div data-testid="sidebar-user-menu" />,
  SidebarAgentTools: () => <div data-testid="sidebar-agent-tools" />,
}));

describe('Sidebar', () => {
  it('hides the New Ticket button when there are no projects', () => {
    render(
      <Sidebar
        workspace={{
          workspaces: [{ id: 'workspace-1', name: 'Gravity' }],
          activeWorkspaceId: 'workspace-1',
          onSelectWorkspace: vi.fn(),
          onOpenWorkspaceDirectory: vi.fn(),
        }}
        projects={{
          projects: [],
          domains: [],
          cycles: [],
          currentUser: { id: 'user-1', name: 'Test User' } as never,
          activeProjectId: '',
          filters: {} as never,
          counts: { myIssues: 0, activeProjectIssues: 0, domains: {}, cycles: {} },
          onSelectProject: vi.fn(),
          onShowProjectIssues: vi.fn(),
          onShowMyIssues: vi.fn(),
          onShowNotes: vi.fn(),
          onSelectCycle: vi.fn(),
          onSelectDomain: vi.fn(),
        }}
        tools={{
          onOpenOllama: vi.fn(),
          onOpenSimulator: vi.fn(),
          onOpenCreateTicket: vi.fn(),
        }}
        userMenu={{
          currentUser: { id: 'user-1', name: 'Test User' } as never,
          onOpenWorkspaceDirectory: vi.fn(),
          onOpenAccountPreferences: vi.fn(),
          onOpenProjectManager: vi.fn(),
          onOpenSettings: vi.fn(),
          onSignOut: vi.fn(),
        }}
      />
    );

    expect(screen.queryByRole('button', { name: 'New Ticket' })).not.toBeInTheDocument();
  });
});