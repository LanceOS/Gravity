import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import type { SidebarNavigationState, SidebarProjectSection } from '../types';
import './styles.css';

interface TeamsSidebarProps {
  section: SidebarProjectSection;
  teamsCollapsed: boolean;
  collapsedTeamProjects: Record<string, boolean>;
  onToggleTeamProjects: (teamId: string) => void;
  onToggleTeamsCollapsed: () => void;
}

function resolveNavigationState(section: SidebarProjectSection): SidebarNavigationState {
  if (section.navigationState) {
    return section.navigationState;
  }

  if (section.activeProjectId) {
    return {
      activeTeam: section.activeTeamId ?? '',
      activeScope: 'projects',
      activeProject: section.activeProjectId,
    };
  }

  if (section.activeCycleId) {
    return {
      activeTeam: section.activeTeamId ?? '',
      activeScope: 'cycles',
      activeProject: '',
    };
  }

  if (section.activeDomainId) {
    return {
      activeTeam: section.activeTeamId ?? '',
      activeScope: 'domains',
      activeProject: '',
    };
  }

  return {
    activeTeam: section.activeTeamId ?? '',
    activeScope: 'views',
    activeProject: '',
  };
}

export function TeamsSidebar({
  section,
  teamsCollapsed,
  collapsedTeamProjects,
  onToggleTeamProjects,
  onToggleTeamsCollapsed,
}: TeamsSidebarProps) {
  const navigationState = resolveNavigationState(section);
  const activeTeamId = navigationState.activeTeam;
  const activeScope = navigationState.activeScope;
  const activeProjectId = navigationState.activeProject;
  const activeViewId = section.activeViewId || (activeScope === 'views' ? 'all' : '');

  return (
    <div className="teams-sidebar">
      <SidebarGroup label="Workspace">
        <SidebarItem
          active={activeScope === 'workspace'}
          onClick={section.onSelectWorkspaceAllTasks}
          leftIcon={<FolderTree size={13} />}
        >
          All Tasks
        </SidebarItem>
      </SidebarGroup>

      <SidebarGroup
        label={
          <button
            type="button"
            onClick={onToggleTeamsCollapsed}
            aria-expanded={!teamsCollapsed}
            className="teams-sidebar__group-toggle"
          >
            {teamsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="teams-sidebar__group-toggle-label">Teams</span>
          </button>
        }
      >
        {!teamsCollapsed && section.teams!.map((team) => {
          const teamContainsActiveProject =
            !!activeProjectId && team.projects?.some((p) => p.id === activeProjectId);
          const isTeamActive = activeTeamId === team.id || teamContainsActiveProject;
          const projectsCollapsed = teamContainsActiveProject ? false : (collapsedTeamProjects[team.id] ?? false);
          const configuredTeamViews = team.views?.filter((view) => view.id !== 'board' && view.type !== 'board') ?? [];
          const teamViews = configuredTeamViews.length > 0
            ? configuredTeamViews
            : [{ id: 'all', name: 'All Tasks', type: 'all' }];

          return (
            <div key={team.id} className="teams-sidebar__team">
              <SidebarItem
                active={isTeamActive && activeScope !== 'projects'}
                onClick={() => {
                  if (section.onSelectTeam) {
                    section.onSelectTeam(team.id);
                    return;
                  }

                  section.onSelectAllTasks?.(team.id);
                }}
                leftIcon={
                  <div
                    className="teams-sidebar__team-color-dot"
                    style={{ background: team.color || 'var(--color-primary)' }}
                  />
                }
              >
                <div className="teams-sidebar__team-label">
                  <span className="teams-sidebar__team-name">{team.name}</span>
                </div>
              </SidebarItem>

              <div className="teams-sidebar__sub-items">
                <SidebarGroup label="Views">
                  {teamViews.map((view) => (
                    <SidebarItem
                      key={view.id}
                      nested
                      active={isTeamActive && activeScope === 'views' && activeViewId === view.id}
                      onClick={() => {
                        if (view.id === 'all') {
                          section.onSelectAllTasks?.(team.id);
                          return;
                        }

                        section.onSelectView?.(team.id, view.id);
                      }}
                      leftIcon={<FolderTree size={13} />}
                    >
                      {view.name}
                    </SidebarItem>
                  ))}
                </SidebarGroup>

                <SidebarGroup label="Cycles">
                  {team.cycles && team.cycles.length > 0 ? (
                    team.cycles.map((cycle) => (
                      <SidebarItem
                        key={cycle.id}
                        nested
                        active={isTeamActive && activeScope === 'cycles' && section.activeCycleId === cycle.id}
                        onClick={() => section.onSelectCycle?.(team.id, cycle.id)}
                        leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                      >
                        <span className={cycle.completed ? 'teams-sidebar__cycle-name--completed' : undefined}>
                          {cycle.name}
                        </span>
                      </SidebarItem>
                    ))
                  ) : (
                    <div className="teams-sidebar__empty">No cycles</div>
                  )}
                </SidebarGroup>

                <SidebarGroup label="Domains">
                  {team.domains && team.domains.length > 0 ? (
                    team.domains.map((domain) => (
                      <SidebarItem
                        key={domain.id}
                        nested
                        active={isTeamActive && activeScope === 'domains' && section.activeDomainId === domain.id}
                        onClick={() => section.onSelectDomain?.(team.id, domain.id)}
                        leftIcon={
                          <div
                            className="teams-sidebar__domain-dot"
                            style={{ background: domain.color }}
                          />
                        }
                      >
                        {domain.name}
                      </SidebarItem>
                    ))
                  ) : (
                    <div className="teams-sidebar__empty">No domains</div>
                  )}
                </SidebarGroup>

                <SidebarGroup
                  label={
                    <button
                      type="button"
                      onClick={() => onToggleTeamProjects(team.id)}
                      aria-expanded={!projectsCollapsed}
                      className="teams-sidebar__group-toggle"
                    >
                      {projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      <span className="teams-sidebar__group-toggle-label">Projects</span>
                    </button>
                  }
                >
                  {!projectsCollapsed && (
                    team.projects && team.projects.length > 0 ? (
                      team.projects.map((project) => (
                        <SidebarItem
                          key={project.id}
                          nested
                          active={isTeamActive && activeScope === 'projects' && project.id === activeProjectId}
                          onClick={() => section.onSelectProject(project.id)}
                          leftIcon={<Database size={13} />}
                        >
                          {project.name}
                        </SidebarItem>
                      ))
                    ) : (
                      <div className="teams-sidebar__empty">No projects</div>
                    )
                  )}
                </SidebarGroup>
              </div>
            </div>
          );
        })}
      </SidebarGroup>
    </div>
  );
}
