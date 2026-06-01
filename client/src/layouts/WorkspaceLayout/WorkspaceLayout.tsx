import { ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar, type SidebarProps } from '../../components/Sidebar';
import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import { Select } from '@library';
import './WorkspaceLayout.css';

interface WorkspaceLayoutProps {
  sidebarProps: SidebarProps;
  children: ReactNode;
  rightPanels?: ReactNode;
  isMobile?: boolean;
}

export function WorkspaceLayout({ sidebarProps, children, rightPanels, isMobile }: WorkspaceLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const closeSidebar = () => setIsMobileSidebarOpen(false);

  const wrapHandler = <T extends (...args: any[]) => any>(handler: T): T => {
    return ((...args: Parameters<T>) => {
      closeSidebar();
      return handler(...args);
    }) as T;
  };

  const mobileSidebarProps = {
    ...sidebarProps,
    workspace: {
      ...sidebarProps.workspace,
      onSelectWorkspace: wrapHandler(sidebarProps.workspace.onSelectWorkspace),
      onOpenWorkspaceDirectory: wrapHandler(sidebarProps.workspace.onOpenWorkspaceDirectory),
    },
    projects: {
      ...sidebarProps.projects,
      onSelectProject: wrapHandler(sidebarProps.projects.onSelectProject),
      onShowProjectIssues: wrapHandler(sidebarProps.projects.onShowProjectIssues),
      onShowMyIssues: wrapHandler(sidebarProps.projects.onShowMyIssues),
      onSelectCycle: wrapHandler(sidebarProps.projects.onSelectCycle),
      onSelectDomain: wrapHandler(sidebarProps.projects.onSelectDomain),
    },
    tools: {
      ...sidebarProps.tools,
      onOpenOllama: wrapHandler(sidebarProps.tools.onOpenOllama),
      onOpenCreateTicket: wrapHandler(sidebarProps.tools.onOpenCreateTicket),
    },
    userMenu: {
      ...sidebarProps.userMenu,
      onOpenWorkspaceDirectory: wrapHandler(sidebarProps.userMenu.onOpenWorkspaceDirectory),
      onOpenAccountPreferences: wrapHandler(sidebarProps.userMenu.onOpenAccountPreferences),
      onOpenProjectManager: wrapHandler(sidebarProps.userMenu.onOpenProjectManager),
      onOpenSettings: wrapHandler(sidebarProps.userMenu.onOpenSettings),
      onSignOut: wrapHandler(sidebarProps.userMenu.onSignOut),
    },
  };

  return (
    <DashboardLayout>
      <DashboardLayout.Header>
        <div className="workspace-header-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="var(--color-text-primary)" strokeWidth="2" />
            <circle cx="12" cy="12" r="6" stroke="var(--color-primary)" strokeWidth="2" strokeDasharray="4 2" />
            <circle cx="12" cy="12" r="2" fill="var(--color-text-primary)" />
          </svg>
          <span className="workspace-header-logo-text">Gravity</span>
        </div>
        
        <div className="workspace-header-workspace-select">
          <Select
            value={sidebarProps.workspace.activeWorkspaceId}
            onValueChange={(val: string) => sidebarProps.workspace.onSelectWorkspace(val)}
            options={sidebarProps.workspace.workspaces.map((item) => ({ value: item.id, label: item.name }))}
            aria-label="Select workspace"
            className="input"
            style={{ width: '100%', minHeight: '34px', padding: '0 10px', fontSize: '13px' }}
          />
        </div>

        {isMobile && (
          <button
            type="button"
            className="workspace-header-hamburger"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
      </DashboardLayout.Header>

      {isMobile ? null : <Sidebar {...sidebarProps} />}

      {isMobile && typeof document !== 'undefined'
        ? createPortal(
            <div className={`mobile-sidebar-overlay ${isMobileSidebarOpen ? 'mobile-sidebar-overlay--open' : ''}`}>
              <div className="mobile-sidebar-backdrop" onClick={closeSidebar} />
              <div className="mobile-sidebar-drawer">
                <Sidebar {...mobileSidebarProps} />
              </div>
            </div>,
            document.body
          )
        : null}

      <DashboardLayout.Main>{children}</DashboardLayout.Main>
      {rightPanels}
    </DashboardLayout>
  );
}