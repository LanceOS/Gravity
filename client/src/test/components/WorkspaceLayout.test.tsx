import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout';
import type { SidebarProps } from '../../components/Sidebar';

vi.mock('@library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@library')>();

  return {
    ...actual,
    Select: () => <select aria-label="Select workspace" />,
  };
});

vi.mock('../../utils/animationUtils', () => ({
  safeAnime: vi.fn(),
}));

vi.mock('animejs', () => ({
  default: { remove: vi.fn() },
}));

const sidebarProps: SidebarProps = {
  workspace: {
    workspaces: [{ id: 'workspace-1', name: 'Gravity' }],
    activeWorkspaceId: 'workspace-1',
    onSelectWorkspace: vi.fn(),
    onOpenWorkspaceDirectory: vi.fn(),
  },
  projects: {
    projects: [{ id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace-1' }],
    labels: [],
    cycles: [],
    currentUser: { id: 'user-1', name: 'Casey Carter' } as never,
    activeProjectId: '',
    filters: {} as never,
    counts: { myIssues: 0, activeProjectIssues: 0, cycles: {} },
    onSelectProject: vi.fn(),
    onShowProjectIssues: vi.fn(),
    onShowMyIssues: vi.fn(),
    onShowNotes: vi.fn(),
  },
  tools: {
    onOpenAgent: vi.fn(),
    onOpenSimulator: vi.fn(),
    onOpenCreateTicket: vi.fn(),
  },
  userMenu: {
    currentUser: { id: 'user-1', name: 'Casey Carter' } as never,
    onOpenWorkspaceDirectory: vi.fn(),
    onOpenAccountPreferences: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenMcp: vi.fn(),
    onSignOut: vi.fn(),
  },
};

describe('WorkspaceLayout sidebar controls', () => {
  it('toggles the desktop sidebar between expanded and icon-only states', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkspaceLayout sidebarProps={sidebarProps}>Content</WorkspaceLayout>,
    );
    const sidebar = container.querySelector('aside.app-sidebar');

    expect(sidebar).not.toHaveClass('sidebar--collapsed');
    expect(sidebar?.querySelector('.sidebar-new-ticket__label')).toHaveTextContent('New Ticket');

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar).toHaveClass('sidebar--collapsed');
    expect(container.firstChild).toHaveClass('dashboard-layout--sidebar-collapsed');

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

    expect(sidebar).not.toHaveClass('sidebar--collapsed');
  });

  it('allows the user menu to escape the compact sidebar column', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkspaceLayout sidebarProps={sidebarProps}>Content</WorkspaceLayout>,
    );
    const sidebar = container.querySelector<HTMLElement>('aside.app-sidebar');

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    await user.click(container.querySelector<HTMLButtonElement>('.sidebar-user-menu__trigger')!);

    expect(sidebar).toHaveClass('sidebar--collapsed');
    expect(sidebar).toHaveStyle({ overflow: 'visible', zIndex: '2' });
    expect(container.querySelector('.sidebar-user-menu__dropdown')).toHaveClass('sidebar-user-menu__dropdown--open');
  });

  it('opens the full sidebar in the mobile drawer', () => {
    const { container } = render(
      <WorkspaceLayout sidebarProps={sidebarProps} isMobile>Content</WorkspaceLayout>,
    );

    fireEvent.click(screen.getByLabelText('Toggle sidebar', { selector: 'button' }));

    expect(container.ownerDocument.querySelector('.mobile-sidebar-overlay')).toHaveClass('mobile-sidebar-overlay--open');
    expect(container.ownerDocument.querySelector('.mobile-sidebar-drawer .app-sidebar')).not.toHaveClass('sidebar--collapsed');
  });
});
