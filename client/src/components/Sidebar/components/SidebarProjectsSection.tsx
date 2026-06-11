import type { SidebarProjectSection } from '../types';
import { TeamsSidebar } from '../teams';
import { IndividualsSidebar } from '../individuals';

interface SidebarProjectsSectionProps {
  section: SidebarProjectSection;
  projectsCollapsed: boolean;
  collapsedProjects: Record<string, boolean>;
  collapsedTeamProjects: Record<string, boolean>;
  teamsCollapsed: boolean;
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
  onToggleTeamProjects: (teamId: string) => void;
  onToggleTeamsCollapsed: () => void;
}

export function SidebarProjectsSection({
  section,
  projectsCollapsed,
  collapsedProjects,
  collapsedTeamProjects,
  teamsCollapsed,
  onToggleProjectsCollapsed,
  onToggleProject,
  onToggleTeamProjects,
  onToggleTeamsCollapsed,
}: SidebarProjectsSectionProps) {
  if (section.hierarchyMode === 'teams' && section.teams && section.teams.length > 0) {
    return (
      <TeamsSidebar
        section={section}
        teamsCollapsed={teamsCollapsed}
        collapsedTeamProjects={collapsedTeamProjects}
        onToggleTeamProjects={onToggleTeamProjects}
        onToggleTeamsCollapsed={onToggleTeamsCollapsed}
      />
    );
  }

  return (
    <IndividualsSidebar
      section={section}
      projectsCollapsed={projectsCollapsed}
      collapsedProjects={collapsedProjects}
      onToggleProjectsCollapsed={onToggleProjectsCollapsed}
      onToggleProject={onToggleProject}
    />
  );
}
