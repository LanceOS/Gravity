import { Sparkles, CheckSquare, Tag, FolderPlus, Users } from 'lucide-react';
import { Sidebar as LibSidebar, SidebarHeader, SidebarContent, SidebarFooter, ContextMenu } from '@library';
import { SidebarProjectsSection, SidebarUserMenu } from './components';
import { SidebarProvider } from './context/SidebarContext';
import { useSidebarViewModel } from './hooks/useSidebarViewModel';
import type { SidebarProps } from './types';

export function Sidebar({ projects, tools, userMenu }: SidebarProps) {
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
