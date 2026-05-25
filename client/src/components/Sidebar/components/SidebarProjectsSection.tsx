import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree, Inbox } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import type { SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isProjectIssuesView } from '../utils';

interface SidebarProjectsSectionProps {
  section: SidebarProjectSection;
  projectsCollapsed: boolean;
  collapsedProjects: Record<string, boolean>;
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
}

export function SidebarProjectsSection({
  section,
  projectsCollapsed,
  collapsedProjects,
  onToggleProjectsCollapsed,
  onToggleProject,
}: SidebarProjectsSectionProps) {
  const showProjectIssues = isProjectIssuesView(section);
  const showMyIssues = isMyIssuesView(section);

  return (
    <div style={{ marginTop: '4px' }}>
      <SidebarGroup
        label={
          <div
            onClick={onToggleProjectsCollapsed}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            {projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span style={{ marginLeft: '4px' }}>Projects</span>
          </div>
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

                  {isActiveProject && !isCollapsed ? (
                    <div style={{ marginLeft: '14px', paddingLeft: '8px', borderLeft: '1px solid var(--color-border-default)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                      </SidebarGroup>

                      <SidebarGroup label="Cycles">
                        {section.cycles.map((cycle) => (
                          <SidebarItem
                            key={cycle.id}
                            nested
                            active={section.filters.cycleId === cycle.id}
                            onClick={() => section.onSelectCycle(cycle.id)}
                            leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                            rightElement={<span style={countBadgeStyle()}>{section.counts.cycles[cycle.id] || 0}</span>}
                          >
                            <span style={{ textDecoration: cycle.completed ? 'line-through' : 'none' }}>{cycle.name}</span>
                          </SidebarItem>
                        ))}
                      </SidebarGroup>

                      <SidebarGroup label="Domains">
                        {section.domains.map((domain) => (
                          <SidebarItem
                            key={domain.id}
                            nested
                            active={section.filters.domainId === domain.id}
                            onClick={() => section.onSelectDomain(domain.id)}
                            leftIcon={<div style={{ width: '8px', height: '8px', borderRadius: '50%', background: domain.color }} />}
                            rightElement={<span style={countBadgeStyle()}>{section.counts.domains[domain.id] || 0}</span>}
                          >
                            {domain.name}
                          </SidebarItem>
                        ))}
                      </SidebarGroup>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SidebarGroup>
    </div>
  );
}