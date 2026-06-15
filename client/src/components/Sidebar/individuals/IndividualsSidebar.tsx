import { CheckCircle, ChevronDown, ChevronRight, Database, FileText, FolderTree, Inbox } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import type { SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isNotesView, isProjectIssuesView } from '../utils';
import './styles.css';

interface IndividualsSidebarProps {
  section: SidebarProjectSection;
  projectsCollapsed: boolean;
  collapsedProjects: Record<string, boolean>;
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
}

export function IndividualsSidebar({
  section,
  projectsCollapsed,
  collapsedProjects,
  onToggleProjectsCollapsed,
  onToggleProject,
}: IndividualsSidebarProps) {
  const showProjectIssues = isProjectIssuesView(section);
  const showMyIssues = isMyIssuesView(section);
  const showNotes = isNotesView(section);
  const labels = section.labels ?? section.domains ?? [];
  const labelCounts = section.counts.labels ?? section.counts.domains ?? {};
  const handleSelectLabel = section.onSelectLabel ?? (() => { });

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

            return (
              <div key={project.id} className="individuals-sidebar__project">
                <SidebarItem
                  active={isActiveProject}
                  onClick={() => onToggleProject(project.id)}
                  leftIcon={isActiveProject && !isCollapsed ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                >
                  <div className="individuals-sidebar__project-label">
                    <Database size={14} />
                    <span>{project.name}</span>
                  </div>
                </SidebarItem>

                {/* Animated accordion — gridTemplateRows is dynamic so stays inline */}
                <div
                  className="individuals-sidebar__accordion"
                  style={{ gridTemplateRows: isActiveProject && !isCollapsed ? '1fr' : '0fr' }}
                >
                  <div className="individuals-sidebar__accordion-inner">
                    <div className="individuals-sidebar__sub-content">
                      <SidebarGroup label="Views">
                        <SidebarItem
                          nested
                          active={showProjectIssues}
                          onClick={section.onShowProjectIssues}
                          leftIcon={<FolderTree size={13} />}
                          rightElement={<span style={countBadgeStyle()}>{section.counts.activeProjectIssues}</span>}
                        >
                          All Issues
                        </SidebarItem>

                        <SidebarItem
                          nested
                          active={showMyIssues}
                          onClick={section.onShowMyIssues}
                          leftIcon={<Inbox size={13} />}
                          rightElement={<span style={countBadgeStyle()}>{section.counts.myIssues}</span>}
                        >
                          My Issues
                        </SidebarItem>

                        <SidebarItem
                          nested
                          active={showNotes}
                          onClick={section.onShowNotes}
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
                            onClick={() => section.onSelectCycleLegacy?.(cycle.id)}
                            leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                            rightElement={<span style={countBadgeStyle()}>{section.counts.cycles[cycle.id] || 0}</span>}
                          >
                            <span className={cycle.completed ? 'individuals-sidebar__cycle-name--completed' : undefined}>
                              {cycle.name}
                            </span>
                          </SidebarItem>
                        ))}
                      </SidebarGroup>

                      <SidebarGroup label="Labels">
                        {labels.map((label) => (
                          <SidebarItem
                            key={label.id}
                            nested
                            active={section.filters.labels?.includes(label.id)}
                            onClick={() => handleSelectLabel(label.id)}
                            leftIcon={
                              <div
                                className="individuals-sidebar__label-dot"
                                style={{ background: label.color }}
                              />
                            }
                            rightElement={<span style={countBadgeStyle()}>{labelCounts[label.id] || 0}</span>}
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
