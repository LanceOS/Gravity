import { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree, Inbox, FileText } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import type { SidebarProjectSection } from '../types';
import { countBadgeStyle, getProjectCollapsedState, isMyIssuesView, isProjectIssuesView, isNotesView } from '../utils';

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
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  if (section.hierarchyMode === 'teams' && section.teams && section.teams.length > 0) {
    return (
      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {section.teams.map((team) => {
          const isCollapsed = collapsedTeams[team.id] ?? false;
          const isTeamActive = section.activeTeamId === team.id;

          return (
            <div key={team.id} style={{ display: 'grid', gap: '4px' }}>
              {/* Team Item */}
              <SidebarItem
                active={isTeamActive && !section.activeProjectId}
                onClick={() => toggleTeam(team.id)}
                leftIcon={isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: team.color || 'var(--color-primary)' }} />
                  <span style={{ fontWeight: '500' }}>{team.name}</span>
                </div>
              </SidebarItem>

              {/* Sub-items */}
              {!isCollapsed && (
                <div style={{ marginLeft: '12px', paddingLeft: '8px', borderLeft: '1px solid var(--color-border-default)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {/* Views */}
                  <SidebarGroup label="Views">
                    <SidebarItem
                      nested
                      active={isTeamActive && !section.activeProjectId && !section.activeCycleId && !section.activeDomainId}
                      onClick={() => section.onSelectAllTasks?.(team.id)}
                      leftIcon={<FolderTree size={13} />}
                    >
                      All Tasks
                    </SidebarItem>
                  </SidebarGroup>

                  {/* Cycles */}
                  {team.cycles && team.cycles.length > 0 && (
                    <SidebarGroup label="Cycles">
                      {team.cycles.map((cycle) => (
                        <SidebarItem
                          key={cycle.id}
                          nested
                          active={isTeamActive && section.activeCycleId === cycle.id}
                          onClick={() => section.onSelectCycle?.(team.id, cycle.id)}
                          leftIcon={<CheckCircle size={13} color={cycle.completed ? 'var(--color-text-disabled)' : 'var(--color-primary)'} />}
                        >
                          <span style={{ textDecoration: cycle.completed ? 'line-through' : 'none' }}>{cycle.name}</span>
                        </SidebarItem>
                      ))}
                    </SidebarGroup>
                  )}

                  {/* Domains */}
                  {team.domains && team.domains.length > 0 && (
                    <SidebarGroup label="Labels">
                      {team.domains.map((domain) => (
                        <SidebarItem
                          key={domain.id}
                          nested
                          active={isTeamActive && section.activeDomainId === domain.id}
                          onClick={() => section.onSelectDomain?.(team.id, domain.id)}
                          leftIcon={<div style={{ width: '8px', height: '8px', borderRadius: '50%', background: domain.color }} />}
                        >
                          {domain.name}
                        </SidebarItem>
                      ))}
                    </SidebarGroup>
                  )}

                  {/* Projects */}
                  {team.projects && team.projects.length > 0 && (
                    <SidebarGroup label="Projects">
                      {team.projects.map((project) => (
                        <SidebarItem
                          key={project.id}
                          nested
                          active={project.id === section.activeProjectId}
                          onClick={() => section.onSelectProject(project.id)}
                          leftIcon={<Database size={13} />}
                        >
                          {project.name}
                        </SidebarItem>
                      ))}
                    </SidebarGroup>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const showProjectIssues = isProjectIssuesView(section);
  const showMyIssues = isMyIssuesView(section);
  const showNotes = isNotesView(section);
  const labels = section.labels ?? section.domains ?? [];
  const labelCounts = section.counts.labels ?? section.counts.domains ?? {};
  const handleSelectLabel = section.onSelectLabel ?? (() => {});

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
