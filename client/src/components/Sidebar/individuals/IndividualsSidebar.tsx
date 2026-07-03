import { CheckCircle, ChevronDown, ChevronRight, Database, FileText, FolderTree, Inbox, Sparkles } from 'lucide-react';
import { useOptionalSidebarContext } from '../context/SidebarContext';
import type { SidebarNavigationState, SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isNotesView, isProjectIssuesView } from '../utils';
import { SidebarNavigation } from '../navigation';

interface IndividualsSidebarProps {
  section?: SidebarProjectSection;
  collapsedProjects?: Record<string, boolean>;
  onToggleProject?: (projectId: string) => void;
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

  return {
    activeTeam: section.activeTeamId ?? '',
    activeScope: 'workspace',
    activeProject: '',
  };
}

function dedupeLabelsById(labels: NonNullable<SidebarProjectSection['labels']>) {
  const seen = new Set<string>();
  const uniqueLabels = [];

  for (const label of labels) {
    if (seen.has(label.id)) {
      continue;
    }

    seen.add(label.id);
    uniqueLabels.push(label);
  }

  return uniqueLabels;
}

export function IndividualsSidebar(props: IndividualsSidebarProps) {
  const context = useOptionalSidebarContext();
  const section = props.section ?? context?.section;
  const collapsedProjects = props.collapsedProjects ?? context?.collapsedProjects ?? {};
  const toggleProject = props.onToggleProject ?? context?.toggleProject;

  if (!section || !toggleProject) {
    throw new Error('IndividualsSidebar requires sidebar props or SidebarProvider context');
  }

  const showProjectIssues = isProjectIssuesView(section);
  const showMyIssues = isMyIssuesView(section);
  const showNotes = isNotesView(section);
  const labelCounts = section.counts.labels ?? section.counts.domains ?? {};
  const handleSelectLabel = section.onSelectLabel ?? (() => { });
  const countsByProject = section.counts.byProject ?? {};
  const navigationState = resolveNavigationState(section);
  const activeScope = navigationState.activeScope;

  const activeWorkspaceActionButtons = [
    section.onSelectWorkspaceAllTasks ? (
      <SidebarNavigation.Item
        key="workspace-all-tasks"
        active={activeScope === 'workspace'}
        onClick={section.onSelectWorkspaceAllTasks}
        leftIcon={<FolderTree size={13} />}
      >
        All Tasks
      </SidebarNavigation.Item>
    ) : null,
    section.onSelectWorkspaceProjects ? (
      <SidebarNavigation.Item
        key="workspace-projects"
        active={activeScope === 'workspace-projects'}
        onClick={section.onSelectWorkspaceProjects}
        leftIcon={<Database size={13} />}
      >
        Projects
      </SidebarNavigation.Item>
    ) : null,
    section.onSelectWorkspaceChat ? (
      <SidebarNavigation.Item
        key="workspace-chat"
        active={activeScope === 'workspace-chat'}
        onClick={section.onSelectWorkspaceChat}
        leftIcon={<Sparkles size={13} />}
      >
        AI Chat
      </SidebarNavigation.Item>
    ) : null,
  ].filter(Boolean);

  return (
    <SidebarNavigation>
      {activeWorkspaceActionButtons.length > 0 ? (
        <SidebarNavigation.Group label="Workspace">
          {activeWorkspaceActionButtons}
        </SidebarNavigation.Group>
      ) : null}

      <SidebarNavigation.Group
        label={
          <SidebarNavigation.Label>Projects</SidebarNavigation.Label>
        }
      >
        <SidebarNavigation.List>
          {section.projects.map((project) => {
            const isActiveProject = project.id === section.activeProjectId;
            const isCollapsed = getProjectCollapsedState(collapsedProjects, project.id, section.activeProjectId);
            const isProjectExpanded = !isCollapsed;
            const isProjectIssueRoute = isActiveProject && showProjectIssues;
            const isProjectMyIssueRoute = isActiveProject && showMyIssues;
            const isProjectNotesRoute = isActiveProject && showNotes;
            const projectCounts = countsByProject[project.id];
            const rawProjectLabels =
              section.labelsByProject?.get(project.id) ??
              (project.id === section.activeProjectId ? section.labels ?? [] : []);
            const projectLabels = dedupeLabelsById(
              rawProjectLabels.filter((label) =>
                label.projectId === project.id || (section.hierarchyMode !== 'flat' && !label.projectId)
              ),
            );
            const projectLabelCounts =
              projectCounts?.labels ?? (project.id === section.activeProjectId ? labelCounts : {} as Record<string, number>);
            const projectCycleCounts = projectCounts?.cycles ?? section.counts.cycles;

            return (
              <SidebarNavigation.Branch key={project.id}>
                <SidebarNavigation.Item
                  active={isActiveProject}
                  onClick={() => {
                    toggleProject(project.id);
                  }}
                  leftIcon={isProjectExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                >
                  <SidebarNavigation.ItemLabel icon={<Database size={14} />}>
                    {project.name}
                  </SidebarNavigation.ItemLabel>
                </SidebarNavigation.Item>

                <SidebarNavigation.Collapse collapsed={!isProjectExpanded}>
                  <SidebarNavigation.SubItems>
                    <SidebarNavigation.Group label="Views">
                      <SidebarNavigation.Item
                        nested
                        active={isProjectIssueRoute}
                        onClick={() => section.onShowProjectIssues?.(project.id)}
                        leftIcon={<FolderTree size={13} />}
                        rightElement={(
                          <span style={countBadgeStyle()}>
                            {countsByProject[project.id]?.activeProjectIssues ?? section.counts.activeProjectIssues}
                          </span>
                        )}
                      >
                        All Issues
                      </SidebarNavigation.Item>

                      <SidebarNavigation.Item
                        nested
                        active={isProjectMyIssueRoute}
                        onClick={() => section.onShowMyIssues?.(project.id)}
                        leftIcon={<Inbox size={13} />}
                        rightElement={(
                          <span style={countBadgeStyle()}>
                            {countsByProject[project.id]?.myIssues ?? section.counts.myIssues}
                          </span>
                        )}
                      >
                        My Issues
                      </SidebarNavigation.Item>

                      <SidebarNavigation.Item
                        nested
                        active={isProjectNotesRoute}
                        onClick={() => section.onShowNotes?.(project.id)}
                        leftIcon={<FileText size={13} />}
                      >
                        Notes
                      </SidebarNavigation.Item>
                    </SidebarNavigation.Group>

                    <SidebarNavigation.Group label="Cycles">
                      {section.cycles.map((cycle) => (
                        <SidebarNavigation.Item
                          key={cycle.id}
                          nested
                          active={section.filters.cycleId === cycle.id}
                          onClick={() => section.onSelectCycleLegacy?.(project.id, cycle.id)}
                          leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                          rightElement={<span style={countBadgeStyle()}>{projectCycleCounts[cycle.id] || 0}</span>}
                        >
                          {cycle.completed ? (
                            <SidebarNavigation.CompletedText>{cycle.name}</SidebarNavigation.CompletedText>
                          ) : (
                            cycle.name
                          )}
                        </SidebarNavigation.Item>
                      ))}
                    </SidebarNavigation.Group>

                    <SidebarNavigation.Group label="Labels">
                      {projectLabels.map((label) => (
                        <SidebarNavigation.Item
                          key={label.id}
                          nested
                          active={project.id === section.activeProjectId && section.filters.labels?.includes(label.id)}
                          onClick={() => handleSelectLabel(project.id, label.id)}
                          leftIcon={<SidebarNavigation.Dot color={label.color} />}
                          rightElement={<span style={countBadgeStyle()}>{projectLabelCounts[label.id] || 0}</span>}
                        >
                          {label.name}
                        </SidebarNavigation.Item>
                      ))}
                    </SidebarNavigation.Group>
                  </SidebarNavigation.SubItems>
                </SidebarNavigation.Collapse>
              </SidebarNavigation.Branch>
            );
          })}
        </SidebarNavigation.List>
      </SidebarNavigation.Group>
    </SidebarNavigation>
  );
}
