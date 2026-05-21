import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree, Inbox } from 'lucide-react';
import type { SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isProjectIssuesView, menuItemStyle, nestedMenuItemStyle, sectionLabelStyle } from '../utils';

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
    <div style={{ marginTop: '16px' }}>
      <div
        onClick={onToggleProjectsCollapsed}
        style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, padding: '6px 8px', textTransform: 'uppercase', cursor: 'pointer' }}
      >
        {projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span style={{ marginLeft: '4px' }}>Projects</span>
      </div>

      {!projectsCollapsed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
          {section.projects.map((project) => {
            const isActiveProject = project.id === section.activeProjectId;
            const isCollapsed = getProjectCollapsedState(collapsedProjects, project.id, section.activeProjectId);

            return (
              <div key={project.id} style={{ display: 'grid', gap: '4px' }}>
                <div
                  className="clickable"
                  onClick={() => onToggleProject(project.id)}
                  style={menuItemStyle(isActiveProject)}
                >
                  {isActiveProject && !isCollapsed ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Database size={14} />
                  <span>{project.name}</span>
                </div>

                {isActiveProject && !isCollapsed ? (
                  <div style={{ marginLeft: '14px', paddingLeft: '10px', borderLeft: '1px solid var(--border)', display: 'grid', gap: '8px' }}>
                    <div style={sectionLabelStyle}>Views</div>

                    <div
                      className="clickable"
                      onClick={section.onShowProjectIssues}
                      style={nestedMenuItemStyle(showProjectIssues)}
                    >
                      <FolderTree size={13} />
                      <span>All Issues</span>
                      <span style={countBadgeStyle()}>{section.counts.activeProjectIssues}</span>
                    </div>

                    <div
                      className="clickable"
                      onClick={section.onShowMyIssues}
                      style={nestedMenuItemStyle(showMyIssues)}
                    >
                      <Inbox size={13} />
                      <span>My Issues</span>
                      <span style={countBadgeStyle()}>{section.counts.myIssues}</span>
                    </div>

                    <div style={sectionLabelStyle}>Cycles</div>
                    {section.cycles.map((cycle) => (
                      <div
                        key={cycle.id}
                        className="clickable"
                        onClick={() => section.onSelectCycle(cycle.id)}
                        style={nestedMenuItemStyle(section.filters.cycleId === cycle.id)}
                      >
                        <CheckCircle size={13} color={cycle.completed ? 'var(--text-muted)' : 'var(--accent)'} />
                        <span style={{ textDecoration: cycle.completed ? 'line-through' : 'none' }}>{cycle.name}</span>
                        <span style={countBadgeStyle()}>{section.counts.cycles[cycle.id] || 0}</span>
                      </div>
                    ))}

                    <div style={sectionLabelStyle}>Domains</div>
                    {section.domains.map((domain) => (
                      <div
                        key={domain.id}
                        className="clickable"
                        onClick={() => section.onSelectDomain(domain.id)}
                        style={nestedMenuItemStyle(section.filters.domainId === domain.id)}
                      >
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: domain.color }} />
                        <span>{domain.name}</span>
                        <span style={countBadgeStyle()}>{section.counts.domains[domain.id] || 0}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}