import type { RefObject } from 'react';
import { ChevronDown, FolderTree, LogOut, Settings2, Sliders } from 'lucide-react';
import type { SidebarUserMenuSection } from '../types';

interface SidebarUserMenuProps {
  userMenu: SidebarUserMenuSection;
  showUserDropdown: boolean;
  onToggleUserDropdown: () => void;
  onCloseUserDropdown: () => void;
  profileRef: RefObject<HTMLDivElement | null>;
}

function getMenuItemClassName(activeArea: SidebarUserMenuSection['activeArea'], area?: SidebarUserMenuSection['activeArea']): string {
  return `sidebar-user-menu__item${area && activeArea === area ? ' sidebar-user-menu__item--active' : ''}`;
}

export function SidebarUserMenu({
  userMenu,
  showUserDropdown,
  onToggleUserDropdown,
  onCloseUserDropdown,
  profileRef,
}: SidebarUserMenuProps) {
  const showWorkspaceManagement = userMenu.showWorkspaceManagement ?? true;
  const workspaceManagementLabel = userMenu.workspaceManagementLabel ?? 'Manage Projects';
  const workspaceManagementArea = userMenu.workspaceManagementArea ?? 'projects';

  return (
    <div
      ref={profileRef}
      className="sidebar-user-menu"
    >
      <button
        type="button"
        onClick={onToggleUserDropdown}
        className="sidebar-user-menu__trigger"
        aria-expanded={showUserDropdown}
      >
        <img
          src={userMenu.currentUser.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'}
          alt={userMenu.currentUser.name}
          className="sidebar-user-menu__avatar"
        />
        <div className="sidebar-user-menu__identity">
          <div className="sidebar-user-menu__name">
            {userMenu.currentUser.name}
          </div>
          <div className="sidebar-user-menu__role">
            {userMenu.currentUser.role || 'User'}
          </div>
        </div>
        <ChevronDown size={14} className="sidebar-user-menu__chevron" />
      </button>

      <div
        className={`sidebar-user-menu__dropdown${showUserDropdown ? ' sidebar-user-menu__dropdown--open' : ''}`}
      >
        <div className="sidebar-user-menu__dropdown-label">
          Account & Settings
        </div>

        <button
          type="button"
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenWorkspaceDirectory();
          }}
          className={getMenuItemClassName(userMenu.activeArea)}
        >
          <FolderTree size={14} color="var(--color-primary)" />
          <span>Workspaces</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenAccountPreferences();
          }}
          className={getMenuItemClassName(userMenu.activeArea, 'account')}
        >
          <Sliders size={14} color="var(--color-primary)" />
          <span>Account Preferences</span>
        </button>

        {showWorkspaceManagement ? (
          <button
            type="button"
            onClick={() => {
              onCloseUserDropdown();
              userMenu.onOpenProjectManager();
            }}
            className={getMenuItemClassName(userMenu.activeArea, workspaceManagementArea)}
          >
            <FolderTree size={14} color="var(--color-primary)" />
            <span>{workspaceManagementLabel}</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenSettings();
          }}
          className={getMenuItemClassName(userMenu.activeArea, 'settings')}
        >
          <Settings2 size={14} color="var(--color-primary)" />
          <span>Workspace Settings</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenMcp();
          }}
          className={getMenuItemClassName(userMenu.activeArea)}
        >
          <Settings2 size={14} color="var(--color-primary)" />
          <span>Connect External AI</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onSignOut();
          }}
          className="sidebar-user-menu__item sidebar-user-menu__item--danger"
        >
          <LogOut size={14} />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
}
