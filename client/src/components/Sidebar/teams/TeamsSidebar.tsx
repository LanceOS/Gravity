import { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronRight, Database, FolderTree } from 'lucide-react';
import { SidebarGroup, SidebarItem } from '@library';
import type { SidebarProjectSection } from '../types';

interface TeamsSidebarProps {
  section: SidebarProjectSection;
}

export function TeamsSidebar({ section }: TeamsSidebarProps) {
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  return (
    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {section.teams!.map((team) => {
        const teamContainsActiveProject =
          !!section.activeProjectId && team.projects?.some((p) => p.id === section.activeProjectId);
        // Auto-expand the team that contains the active project; all teams start expanded by default
        const isCollapsed = teamContainsActiveProject ? false : (collapsedTeams[team.id] ?? false);
        const isTeamActive = section.activeTeamId === team.id || teamContainsActiveProject;

        return (
          <div key={team.id} style={{ display: 'grid', gap: '4px' }}>
            {/* Team header row */}
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

            {/* Collapsible sub-items */}
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

                {/* Labels / Domains */}
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
