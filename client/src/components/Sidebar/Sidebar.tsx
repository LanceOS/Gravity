import { SidebarAgentTools, SidebarHeader, SidebarProjectsSection, SidebarUserMenu } from './components';
import type { SidebarProps } from './types';
import { scrollAreaStyle, sidebarShellStyle, useSidebarState } from './utils';

export function Sidebar({ workspace, projects, tools, userMenu }: SidebarProps) {
  const sidebarState = useSidebarState(projects.activeProjectId, projects.onSelectProject);

  return (
    <aside style={sidebarShellStyle}>
      <SidebarHeader
        workspace={workspace}
        canOpenCreateTicket={projects.projects.length > 0}
        onOpenCreateTicket={tools.onOpenCreateTicket}
      />

      <div style={scrollAreaStyle}>
        <SidebarProjectsSection
          section={projects}
          projectsCollapsed={sidebarState.projectsCollapsed}
          collapsedProjects={sidebarState.collapsedProjects}
          onToggleProjectsCollapsed={sidebarState.toggleProjectsCollapsed}
          onToggleProject={sidebarState.toggleProject}
        />

        <SidebarAgentTools tools={tools} />
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