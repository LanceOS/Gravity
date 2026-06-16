import { CheckCircle, ChevronDown, ChevronRight, Database, FileText, FolderTree, Inbox } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import { useOptionalSidebarContext } from '../context/SidebarContext';
import type { SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isNotesView, isProjectIssuesView } from '../utils';
import './styles.css';

interface IndividualsSidebarProps {
  section?: SidebarProjectSection;
  collapsedProjects?: Record<string, boolean>;
  onToggleProject?: (projectId: string) => void;
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

  return (
    <div className="individuals-sidebar">
      <SidebarGroup
        label={
          <span className="individuals-sidebar__group-label">Projects</span>
        }
      >
        <div className="individuals-sidebar__project-list">
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
                (project.id === section.activeProjectId ? section.labels : []);
              const projectLabels = dedupeLabelsById(
                rawProjectLabels.filter((label) => !label.projectId || label.projectId === project.id),
              );
              const projectLabelCounts =
                projectCounts?.labels ?? (project.id === section.activeProjectId ? labelCounts : {} as Record<string, number>);
            const projectCycleCounts = projectCounts?.cycles ?? section.counts.cycles;

            return (
              <div key={project.id} className="individuals-sidebar__project">
                <SidebarItem
                  active={isActiveProject}
                  onClick={() => {
                    toggleProject(project.id);
                  }}
                  leftIcon={isProjectExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                >
                  <div className="individuals-sidebar__project-label">
                    <Database size={14} />
                    <span>{project.name}</span>
                  </div>
                </SidebarItem>

                {/* Animated accordion — gridTemplateRows is dynamic so stays inline */}
                <div
                  className="individuals-sidebar__accordion"
                  style={{
                    gridTemplateRows: isProjectExpanded ? '1fr' : '0fr',
                    opacity: isProjectExpanded ? 1 : 0,
                    pointerEvents: isProjectExpanded ? 'auto' : 'none',
                  }}
                >
                  <div className="individuals-sidebar__accordion-inner">
                    <div className="individuals-sidebar__sub-content">
                      <SidebarGroup label="Views">
                          <SidebarItem
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
                          </SidebarItem>

                          <SidebarItem
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
                          </SidebarItem>

                        <SidebarItem
                          nested
                          active={isProjectNotesRoute}
                          onClick={() => section.onShowNotes?.(project.id)}
                          leftIcon={<FileText size={13} />}
                        >
                          Notes
                        </SidebarItem>
                      </SidebarGroup>

                      <SidebarGroup label="Cycles">
                        {section.cycles.map((cycle) => (
                          <SidebarItem
                            key={cycle.id}
                            nested
                            active={section.filters.cycleId === cycle.id}
                            onClick={() => section.onSelectCycleLegacy?.(project.id, cycle.id)}
                            leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                            rightElement={<span style={countBadgeStyle()}>{projectCycleCounts[cycle.id] || 0}</span>}
                          >
                            <span className={cycle.completed ? 'individuals-sidebar__cycle-name--completed' : undefined}>
                              {cycle.name}
                            </span>
                          </SidebarItem>
                        ))}
                      </SidebarGroup>

                      <SidebarGroup label="Labels">
                        {projectLabels.map((label) => (
                          <SidebarItem
                            key={label.id}
                            nested
                            active={project.id === section.activeProjectId && section.filters.labels?.includes(label.id)}
                            onClick={() => handleSelectLabel(project.id, label.id)}
                            leftIcon={
                              <div
                                className="individuals-sidebar__label-dot"
                                style={{ background: label.color }}
                              />
                            }
                            rightElement={<span style={countBadgeStyle()}>{projectLabelCounts[label.id] || 0}</span>}
                          >
                            {label.name}
                          </SidebarItem>
                        ))}
                      </SidebarGroup>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SidebarGroup>
    </div>
  );
}
