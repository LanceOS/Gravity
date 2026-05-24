import { Sparkles } from 'lucide-react';
import { SidebarAgentTools, SidebarProjectsSection, SidebarUserMenu } from './components';
import type { SidebarProps } from './types';
import { scrollAreaStyle, sidebarShellStyle, useSidebarState } from './utils';

export function Sidebar({ workspace, projects, tools, userMenu }: SidebarProps) {
  const sidebarState = useSidebarState(projects.activeProjectId, projects.onSelectProject);

  return (
    <aside style={sidebarShellStyle}>
      {projects.projects.length > 0 ? (
        <div style={{ padding: '16px 16px 8px 16px' }}>
          <button
            type="button"
            onClick={tools.onOpenCreateTicket}
            className="btn btn-primary clickable"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}
          >
            <Sparkles size={14} />
            <span>New Ticket</span>
            <span aria-hidden="true" style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px' }}>N</span>
          </button>
        </div>
      ) : null}

      <div style={scrollAreaStyle}>
        <SidebarProjectsSection
          section={projects}
          projectsCollapsed={sidebarState.projectsCollapsed}
          collapsedProjects={sidebarState.collapsedProjects}
          onToggleProjectsCollapsed={sidebarState.toggleProjectsCollapsed}
          onToggleProject={sidebarState.toggleProject}
        />
      </div>

      <SidebarUserMenu
        userMenu={userMenu}
        showUserDropdown={sidebarState.showUserDropdown}
        onToggleUserDropdown={sidebarState.toggleUserDropdown}
        onCloseUserDropdown={sidebarState.closeUserDropdown}
        profileRef={sidebarState.profileRef}
      />
    </aside>
  );
}