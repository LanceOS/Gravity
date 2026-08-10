import { ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Menu, PanelLeftClose, PanelLeftOpen, SendHorizonal, X } from 'lucide-react';
import { Sidebar, type SidebarProps } from '../../components/Sidebar';
import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import { Select } from '@library';
import './WorkspaceLayout.css';
import { safeAnime } from '../../utils/animationUtils';
import anime from 'animejs';

interface WorkspaceLayoutProps {
  sidebarProps: SidebarProps;
  children: ReactNode;
  rightPanels?: ReactNode;
  headerChatHistory?: ReactNode;
  headerChatHistoryMenu?: ReactNode;
  isMobile?: boolean;
}

export function WorkspaceLayout({
  sidebarProps,
  children,
  rightPanels,
  headerChatHistory,
  headerChatHistoryMenu,
  isMobile,
}: WorkspaceLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const closeSidebar = () => setIsMobileSidebarOpen(false);

  useEffect(() => {
    if (!isMobile) return;

    const drawer = drawerRef.current;
    const backdrop = backdropRef.current;

    if (!drawer || !backdrop) return;

    if (isMobileSidebarOpen) {
      anime.remove([drawer, backdrop]);
      
      safeAnime({
        targets: backdrop,
        opacity: [0, 1],
        duration: 200,
        easing: 'cubic-bezier(0.2, 0, 0.38, 1)',
      });

      safeAnime({
        targets: drawer,
        translateX: ['-100%', '0%'],
        duration: 240,
        easing: 'cubic-bezier(0.2, 0, 0.38, 1)',
      });
    } else {
      anime.remove([drawer, backdrop]);
      
      safeAnime({
        targets: backdrop,
        opacity: [1, 0],
        duration: 170,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      });

      safeAnime({
        targets: drawer,
        translateX: ['0%', '-100%'],
        duration: 210,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      });
    }
  }, [isMobileSidebarOpen, isMobile]);

  const wrapHandler = <Args extends unknown[], ReturnValue>(handler: (...args: Args) => ReturnValue) => {
    return (...args: Args): ReturnValue => {
      closeSidebar();
      return handler(...args);
    };
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
      onShowNotes: wrapHandler(sidebarProps.projects.onShowNotes),
      onSelectCycle: sidebarProps.projects.onSelectCycle ? wrapHandler(sidebarProps.projects.onSelectCycle) : undefined,
    },
    tools: {
      ...sidebarProps.tools,
      onOpenAgent: wrapHandler(sidebarProps.tools.onOpenAgent),
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
    <DashboardLayout sidebarCollapsed={isSidebarCollapsed}>
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
            className="input workspace-header-workspace-select-control"
          />
        </div>

        {headerChatHistory ? (
          <div className="workspace-header-chat-history-slot">
            {headerChatHistory}
          </div>
        ) : null}

        <div className="workspace-header-actions">
          {headerChatHistoryMenu}

          <button
            type="button"
            className={`workspace-header-ask-agent-button${sidebarProps.tools.isAgentOpen ? ' workspace-header-ask-agent-button--active' : ''}`}
            onClick={sidebarProps.tools.onOpenAgent}
            aria-label={sidebarProps.tools.isAgentOpen ? 'Close AI Assistant' : 'Ask Agent'}
          >
            {sidebarProps.tools.isAgentOpen ? <X size={13} /> : <SendHorizonal size={13} />}
            {sidebarProps.tools.isAgentOpen ? 'Close' : 'Ask Agent'}
          </button>

          {!isMobile ? (
            <button
              type="button"
              className="workspace-header-sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          ) : null}

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
        </div>
      </DashboardLayout.Header>

      {isMobile ? null : <Sidebar {...sidebarProps} collapsed={isSidebarCollapsed} />}

      {isMobile && typeof document !== 'undefined'
        ? createPortal(
            <div className={`mobile-sidebar-overlay ${isMobileSidebarOpen ? 'mobile-sidebar-overlay--open' : ''}`}>
              <div ref={backdropRef} className="mobile-sidebar-backdrop" onClick={closeSidebar} />
              <div ref={drawerRef} className="mobile-sidebar-drawer">
                <Sidebar {...mobileSidebarProps} collapsed={false} />
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
