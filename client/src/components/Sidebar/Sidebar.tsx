import { Sparkles } from 'lucide-react';
import { Sidebar as LibSidebar, SidebarHeader, SidebarContent, SidebarFooter } from '@library';
import { SidebarProjectsSection, SidebarUserMenu } from './components';
import type { SidebarProps } from './types';
import { useSidebarState } from './utils';

export function Sidebar({ projects, tools, userMenu }: SidebarProps) {
  const sidebarState = useSidebarState(projects.activeProjectId, projects.onSelectProject);

  // Show the "New Ticket" header when there are projects — either in flat mode or via teams
  const hasAnyProject =
    projects.projects.length > 0 ||
    (projects.teams ?? []).some((t) => t.projects && t.projects.length > 0);

  return (
    <LibSidebar>
      {hasAnyProject ? (
        <SidebarHeader>
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
        </SidebarHeader>
      ) : null}

      <SidebarContent>
        <SidebarProjectsSection
          section={projects}
          projectsCollapsed={sidebarState.projectsCollapsed}
          collapsedProjects={sidebarState.collapsedProjects}
          collapsedTeamProjects={sidebarState.collapsedTeamProjects}
          teamsCollapsed={sidebarState.teamsCollapsed}
          onToggleProjectsCollapsed={sidebarState.toggleProjectsCollapsed}
          onToggleProject={sidebarState.toggleProject}
          onToggleTeamProjects={sidebarState.toggleTeamProjects}
          onToggleTeamsCollapsed={sidebarState.toggleTeamsCollapsed}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu
          userMenu={userMenu}
          showUserDropdown={sidebarState.showUserDropdown}
          onToggleUserDropdown={sidebarState.toggleUserDropdown}
          onCloseUserDropdown={sidebarState.closeUserDropdown}
          profileRef={sidebarState.profileRef}
        />
      </SidebarFooter>
    </LibSidebar>
  );
}
