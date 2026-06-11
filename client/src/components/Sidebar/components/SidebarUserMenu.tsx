import type { RefObject } from 'react';
import { ChevronDown, FolderTree, LogOut, Settings2, Sliders } from 'lucide-react';
import type { SidebarUserMenuSection } from '../types';
import { dropdownItemStyle } from '../utils';

interface SidebarUserMenuProps {
  userMenu: SidebarUserMenuSection;
  showUserDropdown: boolean;
  onToggleUserDropdown: () => void;
  onCloseUserDropdown: () => void;
  profileRef: RefObject<HTMLDivElement | null>;
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

  return (
    <div
      ref={profileRef}
      style={{
        position: 'relative',
      }}
    >
      <div
        onClick={onToggleUserDropdown}
        className="clickable"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '6px',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        <img
          src={userMenu.currentUser.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'}
          alt={userMenu.currentUser.name}
          style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--color-border-default)' }}
        />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {userMenu.currentUser.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', textTransform: 'capitalize' }}>
            {userMenu.currentUser.role || 'User'}
          </div>
        </div>
        <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--color-text-disabled)' }} />
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '0',
          right: '0',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '8px',
          padding: '6px',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          marginBottom: '6px',
          opacity: showUserDropdown ? 1 : 0,
          visibility: showUserDropdown ? 'visible' : 'hidden',
          transform: showUserDropdown ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: showUserDropdown ? 'auto' : 'none',
        }}
      >
        <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase', borderBottom: '1px solid var(--color-border-default)', marginBottom: '4px' }}>
          Account & Settings
        </div>

        <div
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenWorkspaceDirectory();
          }}
          className="clickable"
          style={dropdownItemStyle(userMenu.activeArea)}
        >
          <FolderTree size={14} color="var(--color-primary)" />
          <span>Workspaces</span>
        </div>

        <div
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenAccountPreferences();
          }}
          className="clickable"
          style={dropdownItemStyle(userMenu.activeArea, 'account')}
        >
          <Sliders size={14} color="var(--color-primary)" />
          <span>Account Preferences</span>
        </div>

        {showWorkspaceManagement ? (
          <div
            onClick={() => {
              onCloseUserDropdown();
              userMenu.onOpenProjectManager();
            }}
            className="clickable"
            style={dropdownItemStyle(userMenu.activeArea, 'projects')}
          >
            <FolderTree size={14} color="var(--color-primary)" />
            <span>{workspaceManagementLabel}</span>
          </div>
        ) : null}

        <div
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenSettings();
          }}
          className="clickable"
          style={dropdownItemStyle(userMenu.activeArea, 'settings')}
        >
          <Settings2 size={14} color="var(--color-primary)" />
          <span>Workspace Settings</span>
        </div>

        <div
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onOpenMcp();
          }}
          className="clickable"
          style={dropdownItemStyle(userMenu.activeArea)}
        >
          <Settings2 size={14} color="var(--color-primary)" />
          <span>Connect External AI</span>
        </div>

        <div
          onClick={() => {
            onCloseUserDropdown();
            userMenu.onSignOut();
          }}
          className="clickable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            borderTop: '1px solid var(--color-border-default)',
            marginTop: '4px',
            color: 'var(--color-primary)',
          }}
        >
          <LogOut size={14} />
          <span>Log Out</span>
        </div>
      </div>
    </div>
  );
}
