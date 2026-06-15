import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree, Plus } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import { useOptionalSidebarContext } from '../context/SidebarContext';
import type { SidebarNavigationState, SidebarProjectSection } from '../types';
import { getTeamCollapsedState } from '../utils';
import './styles.css';

interface TeamsSidebarProps {
  section?: SidebarProjectSection;
  collapsedTeams?: Record<string, boolean>;
  collapsedTeamProjects?: Record<string, boolean>;
  onToggleTeam?: (teamId: string) => void;
  onToggleTeamProjects?: (teamId: string) => void;
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

  if (section.activeLabelId) {
    return {
      activeTeam: section.activeTeamId ?? '',
      activeScope: 'labels',
      activeProject: '',
    };
  }

  return {
    activeTeam: section.activeTeamId ?? '',
    activeScope: 'views',
    activeProject: '',
  };
}

export function TeamsSidebar(props: TeamsSidebarProps) {
  const context = useOptionalSidebarContext();
  const section = props.section ?? context?.section;
  const collapsedTeams = props.collapsedTeams ?? context?.collapsedTeams ?? {};
  const collapsedTeamProjects = props.collapsedTeamProjects ?? context?.collapsedTeamProjects ?? {};
  const toggleTeam = props.onToggleTeam ?? context?.toggleTeam;
  const toggleTeamProjects = props.onToggleTeamProjects ?? context?.toggleTeamProjects;

  if (!section || !toggleTeam || !toggleTeamProjects) {
    throw new Error('TeamsSidebar requires sidebar props or SidebarProvider context');
  }

  const navigationState = resolveNavigationState(section);
  const activeTeamId = navigationState.activeTeam;
  const activeScope = navigationState.activeScope;
  const activeProjectId = navigationState.activeProject;
  const activeViewId = section.activeViewId || (activeScope === 'views' ? 'all' : '');
  const teams = section.teams ?? [];

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
        <SidebarItem
          active={activeScope === 'workspace-projects'}
          onClick={section.onSelectWorkspaceProjects}
          leftIcon={<Database size={13} />}
        >
          Projects
        </SidebarItem>
      </SidebarGroup>

      <SidebarGroup
        label={
          <div className="teams-sidebar__header">
            <span>Teams</span>
            {section.isWorkspaceOwner && (
              <button
                type="button"
                className="teams-sidebar__add-team-btn"
                onClick={section.onOpenTeamManager}
                title="Manage Teams"
                aria-label="Manage Teams"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        }
      >
        {teams.map((team) => {
          const teamContainsActiveProject =
            !!activeProjectId && team.projects?.some((p) => p.id === activeProjectId);
          const isTeamActive = activeTeamId === team.id || teamContainsActiveProject;
          const teamCollapsed = getTeamCollapsedState(collapsedTeams, team.id, activeTeamId);
          const projectsCollapsed = teamContainsActiveProject ? false : (collapsedTeamProjects[team.id] ?? false);
          const configuredTeamViews = team.views?.filter((view) => view.id !== 'board' && view.type !== 'board') ?? [];
          const teamLabels = team.labels ?? [];
          const teamViews = configuredTeamViews.length > 0
            ? configuredTeamViews
            : [{ id: 'all', name: 'All Tasks', type: 'all' }];

          return (
            <div key={team.id} className="teams-sidebar__team">
              <SidebarItem
                active={
                  isTeamActive &&
                  (activeScope !== 'projects' || teamCollapsed || projectsCollapsed || (activeScope === 'projects' && !activeProjectId))
                }
                onClick={() => toggleTeam(team.id)}
                leftIcon={
                  <div className="teams-sidebar__team-icon">
                    {teamCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <div
                      className="teams-sidebar__team-color-dot"
                      style={{ background: team.color || 'var(--color-primary)' }}
                    />
                  </div>
                }
              >
                <div className="teams-sidebar__team-label">
                  <span className="teams-sidebar__team-name">{team.name}</span>
                </div>
              </SidebarItem>

              <div
                className={`teams-sidebar__sub-items-container ${
                  teamCollapsed ? 'teams-sidebar__sub-items-container--collapsed' : ''
                }`}
                aria-hidden={teamCollapsed}
              >
                <div className="teams-sidebar__sub-items-wrapper">
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

                    <SidebarGroup label="Labels">
                      {teamLabels.length > 0 ? (
                        teamLabels.map((label) => (
                          <SidebarItem
                            key={label.id}
                            nested
                            active={isTeamActive && activeScope === 'labels' && section.activeLabelId === label.id}
                            onClick={() => section.onSelectTeamLabel?.(team.id, label.id)}
                            leftIcon={
                              <div
                                className="teams-sidebar__label-dot"
                                style={{ background: label.color }}
                              />
                            }
                          >
                            {label.name}
                          </SidebarItem>
                        ))
                      ) : (
                        <div className="teams-sidebar__empty">No labels</div>
                      )}
                    </SidebarGroup>

                    <SidebarGroup
                      label={
                        <button
                          type="button"
                          onClick={() => toggleTeamProjects(team.id)}
                          aria-expanded={!projectsCollapsed}
                          className="teams-sidebar__group-toggle"
                        >
                          {projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          <span className="teams-sidebar__group-toggle-label">Projects</span>
                        </button>
                      }
                    >
                      {!projectsCollapsed ? (
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
                      ) : null}
                    </SidebarGroup>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </SidebarGroup>
    </div>
  );
}
