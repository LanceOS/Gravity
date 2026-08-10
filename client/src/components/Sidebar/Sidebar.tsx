import { Sparkles, CheckSquare, Tag, FolderPlus, Users } from 'lucide-react';
import { Sidebar as LibSidebar, SidebarHeader, SidebarContent, SidebarFooter, ContextMenu } from '@library';
import { SidebarProjectsSection, SidebarUserMenu } from './components';
import { SidebarProvider } from './context/SidebarContext';
import { useSidebarViewModel } from './hooks/useSidebarViewModel';
import type { SidebarProps } from './types';
import './Sidebar.css';

interface SidebarComponentProps extends SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ projects, tools, userMenu, collapsed = false }: SidebarComponentProps) {
  const sidebarViewModel = useSidebarViewModel(
    projects.activeProjectId,
    projects.activeTeamId ?? '',
    projects.onSelectProject,
    projects.onSelectTeam,
    projects.onPrefetchProject,
    projects.onHasCachedProjectData,
  );

  // Show the "New Ticket" header when there are projects, either project-based or grouped by teams.
  const hasAnyProject =
    projects.projects.length > 0 ||
    (projects.teams ?? []).some((t) => t.projects && t.projects.length > 0);

  return (
    <LibSidebar className={`app-sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {hasAnyProject ? (
        <SidebarHeader>
          <button
            type="button"
            onClick={tools.onOpenCreateTicket}
            className="btn btn-primary sidebar-new-ticket"
            title="New Ticket"
          >
            <Sparkles size={14} />
            <span className="sidebar-new-ticket__label">New Ticket</span>
            <span aria-hidden="true" className="sidebar-new-ticket__shortcut">N</span>
          </button>
        </SidebarHeader>
      ) : null}

      <ContextMenu.Root
        content={
          <>
            <ContextMenu.Item icon={<CheckSquare size={14} />} onClick={tools.onOpenCreateTicket}>
              New Ticket
            </ContextMenu.Item>
            {tools.onOpenCreateLabel && (
              <ContextMenu.Item icon={<Tag size={14} />} onClick={tools.onOpenCreateLabel}>
                New Label
              </ContextMenu.Item>
            )}
            {tools.onOpenCreateProject && (
              <ContextMenu.Item icon={<FolderPlus size={14} />} onClick={tools.onOpenCreateProject}>
                New Project
              </ContextMenu.Item>
            )}
            {projects.hierarchyMode === 'teams' && projects.onOpenCreateTeam && (
              <ContextMenu.Item icon={<Users size={14} />} onClick={projects.onOpenCreateTeam}>
                New Team
              </ContextMenu.Item>
            )}
          </>
        }
      >
        <SidebarContent>
          <SidebarProvider section={projects} viewModel={sidebarViewModel}>
            <SidebarProjectsSection section={projects} />
          </SidebarProvider>
        </SidebarContent>
      </ContextMenu.Root>

      <SidebarFooter>
        <SidebarUserMenu
          userMenu={userMenu}
          showUserDropdown={sidebarViewModel.showUserDropdown}
          onToggleUserDropdown={sidebarViewModel.toggleUserDropdown}
          onCloseUserDropdown={sidebarViewModel.closeUserDropdown}
          profileRef={sidebarViewModel.profileRef}
        />
      </SidebarFooter>
    </LibSidebar>
  );
}
