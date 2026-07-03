import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree, Plus, Sparkles } from 'lucide-react';
import { useOptionalSidebarContext } from '../context/SidebarContext';
import type { SidebarNavigationState, SidebarProjectSection } from '../types';
import { getTeamCollapsedState } from '../utils';
import { SidebarNavigation } from '../navigation';

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
    <SidebarNavigation>
      <SidebarNavigation.Group label="Workspace">
        {section.onSelectWorkspaceAllTasks ? (
          <SidebarNavigation.Item
            active={activeScope === 'workspace'}
            onClick={section.onSelectWorkspaceAllTasks}
            leftIcon={<FolderTree size={13} />}
          >
            All Tasks
          </SidebarNavigation.Item>
        ) : null}
        {section.onSelectWorkspaceProjects ? (
          <SidebarNavigation.Item
            active={activeScope === 'workspace-projects'}
            onClick={section.onSelectWorkspaceProjects}
            leftIcon={<Database size={13} />}
          >
            Projects
          </SidebarNavigation.Item>
        ) : null}
        {section.onSelectWorkspaceChat ? (
          <SidebarNavigation.Item
            active={activeScope === 'workspace-chat'}
            onClick={section.onSelectWorkspaceChat}
            leftIcon={<Sparkles size={13} />}
          >
            AI Chat
          </SidebarNavigation.Item>
        ) : null}
      </SidebarNavigation.Group>

      <SidebarNavigation.Group
        label={
          <SidebarNavigation.SectionHeader>
            <span>Teams</span>
            {section.isWorkspaceOwner && (
              <SidebarNavigation.IconButton
                onClick={section.onOpenTeamManager}
                title="Manage Teams"
                aria-label="Manage Teams"
              >
                <Plus size={16} />
              </SidebarNavigation.IconButton>
            )}
          </SidebarNavigation.SectionHeader>
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
            <SidebarNavigation.Branch key={team.id}>
              <SidebarNavigation.Item
                active={
                  isTeamActive &&
                  (activeScope !== 'projects' || teamCollapsed || projectsCollapsed || (activeScope === 'projects' && !activeProjectId))
                }
                onClick={() => toggleTeam(team.id)}
                leftIcon={
                  <SidebarNavigation.ItemIcon>
                    {teamCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <SidebarNavigation.Dot color={team.color || 'var(--color-primary)'} />
                  </SidebarNavigation.ItemIcon>
                }
              >
                <SidebarNavigation.ItemLabel>{team.name}</SidebarNavigation.ItemLabel>
              </SidebarNavigation.Item>

              <SidebarNavigation.Collapse collapsed={teamCollapsed}>
                <SidebarNavigation.SubItems>
                  <SidebarNavigation.Group label="Views">
                    {teamViews.map((view) => (
                      <SidebarNavigation.Item
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
                      </SidebarNavigation.Item>
                    ))}
                  </SidebarNavigation.Group>

                  <SidebarNavigation.Group label="Cycles">
                    {team.cycles && team.cycles.length > 0 ? (
                      team.cycles.map((cycle) => (
                        <SidebarNavigation.Item
                          key={cycle.id}
                          nested
                          active={isTeamActive && activeScope === 'cycles' && section.activeCycleId === cycle.id}
                          onClick={() => section.onSelectCycle?.(team.id, cycle.id)}
                          leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                        >
                          {cycle.completed ? (
                            <SidebarNavigation.CompletedText>{cycle.name}</SidebarNavigation.CompletedText>
                          ) : (
                            cycle.name
                          )}
                        </SidebarNavigation.Item>
                      ))
                    ) : (
                      <SidebarNavigation.Empty>No cycles</SidebarNavigation.Empty>
                    )}
                  </SidebarNavigation.Group>

                  <SidebarNavigation.Group label="Labels">
                    {teamLabels.length > 0 ? (
                      teamLabels.map((label) => (
                        <SidebarNavigation.Item
                          key={label.id}
                          nested
                          active={isTeamActive && activeScope === 'labels' && section.activeLabelId === label.id}
                          onClick={() => section.onSelectTeamLabel?.(team.id, label.id)}
                          leftIcon={<SidebarNavigation.Dot color={label.color} />}
                        >
                          {label.name}
                        </SidebarNavigation.Item>
                      ))
                    ) : (
                      <SidebarNavigation.Empty>No labels</SidebarNavigation.Empty>
                    )}
                  </SidebarNavigation.Group>

                  <SidebarNavigation.Group
                    label={
                      <SidebarNavigation.GroupToggle
                        onClick={() => toggleTeamProjects(team.id)}
                        expanded={!projectsCollapsed}
                        icon={projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      >
                        Projects
                      </SidebarNavigation.GroupToggle>
                    }
                  >
                    {!projectsCollapsed ? (
                      team.projects && team.projects.length > 0 ? (
                        team.projects.map((project) => (
                          <SidebarNavigation.Item
                            key={project.id}
                            nested
                            active={isTeamActive && activeScope === 'projects' && project.id === activeProjectId}
                            onClick={() => section.onSelectProject(project.id)}
                            leftIcon={<Database size={13} />}
                          >
                            {project.name}
                          </SidebarNavigation.Item>
                        ))
                      ) : (
                        <SidebarNavigation.Empty>No projects</SidebarNavigation.Empty>
                      )
                    ) : null}
                  </SidebarNavigation.Group>
                </SidebarNavigation.SubItems>
              </SidebarNavigation.Collapse>
            </SidebarNavigation.Branch>
          );
        })}
      </SidebarNavigation.Group>
    </SidebarNavigation>
  );
}
