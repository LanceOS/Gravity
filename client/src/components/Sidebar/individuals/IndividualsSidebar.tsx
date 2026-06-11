import { CheckCircle, ChevronDown, ChevronRight, Database, FileText, FolderTree, Inbox } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import type { SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isNotesView, isProjectIssuesView } from '../utils';

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
    <div style={{ marginTop: '4px' }}>
      <SidebarGroup
        label={
          <button
            type="button"
            onClick={onToggleProjectsCollapsed}
            aria-expanded={!projectsCollapsed}
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              color: 'inherit',
              width: '100%',
              textAlign: 'left',
            }}
          >
            {projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span style={{ marginLeft: '4px' }}>Projects</span>
          </button>
        }
      >
        {!projectsCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
            {section.projects.map((project) => {
              const isActiveProject = project.id === section.activeProjectId;
              const isCollapsed = getProjectCollapsedState(collapsedProjects, project.id, section.activeProjectId);

              return (
                <div key={project.id} style={{ display: 'grid', gap: '4px' }}>
                  <SidebarItem
                    active={isActiveProject}
                    onClick={() => onToggleProject(project.id)}
                    leftIcon={isActiveProject && !isCollapsed ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={14} />
                      <span>{project.name}</span>
                    </div>
                  </SidebarItem>

                  {/* Animated sub-section */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: isActiveProject && !isCollapsed ? '1fr' : '0fr',
                      transition: 'grid-template-rows var(--transition-normal)',
                    }}
                  >
                    <div style={{ overflow: 'hidden', minHeight: 0 }}>
                      <div style={{ marginLeft: '14px', paddingLeft: '8px', borderLeft: '1px solid var(--color-border-default)', display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px', paddingBottom: '4px' }}>
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
                              <span style={{ textDecoration: cycle.completed ? 'line-through' : 'none' }}>{cycle.name}</span>
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
                              leftIcon={<div style={{ width: '8px', height: '8px', borderRadius: '50%', background: label.color }} />}
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
        )}
      </SidebarGroup>
    </div>
  );
}
