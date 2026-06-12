import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarUserMenu } from '../../components/Sidebar/components/SidebarUserMenu.tsx';
import type { SidebarUserMenuSection } from '../../components/Sidebar/types';

function renderUserMenu(overrides: Partial<SidebarUserMenuSection> = {}) {
  const userMenu: SidebarUserMenuSection = {
    currentUser: {
      id: 'user-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
    },
    activeArea: 'workspace',
    onOpenWorkspaceDirectory: vi.fn(),
    onOpenAccountPreferences: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenMcp: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  const onCloseUserDropdown = vi.fn();

  return {
    ...render(
      <SidebarUserMenu
        userMenu={userMenu}
        showUserDropdown
        onToggleUserDropdown={vi.fn()}
        onCloseUserDropdown={onCloseUserDropdown}
        profileRef={createRef<HTMLDivElement>()}
      />
    ),
    onCloseUserDropdown,
    userMenu,
  };
}

describe('SidebarUserMenu', () => {
  it('shows Manage Projects by default', async () => {
    const user = userEvent.setup();
    const { onCloseUserDropdown, userMenu } = renderUserMenu();

    await user.click(screen.getByText('Manage Projects'));

    expect(userMenu.onOpenProjectManager).toHaveBeenCalledTimes(1);
    expect(onCloseUserDropdown).toHaveBeenCalledTimes(1);
  });

  it('can replace Manage Projects with Manage Teams', async () => {
    const user = userEvent.setup();
    const { userMenu } = renderUserMenu({ workspaceManagementLabel: 'Manage Teams' });

    expect(screen.queryByText('Manage Projects')).not.toBeInTheDocument();

    await user.click(screen.getByText('Manage Teams'));

    expect(userMenu.onOpenProjectManager).toHaveBeenCalledTimes(1);
  });

  it('can hide the workspace management item', () => {
    renderUserMenu({
      showWorkspaceManagement: false,
      workspaceManagementLabel: 'Manage Teams',
    });

    expect(screen.queryByText('Manage Teams')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage Projects')).not.toBeInTheDocument();
  });
});
