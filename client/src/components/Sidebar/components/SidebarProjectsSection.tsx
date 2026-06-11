import type { SidebarProjectSection } from '../types';
import { TeamsSidebar } from '../teams';
import { IndividualsSidebar } from '../individuals';

interface SidebarProjectsSectionProps {
  section: SidebarProjectSection;
  projectsCollapsed: boolean;
  collapsedProjects: Record<string, boolean>;
  collapsedTeamProjects: Record<string, boolean>;
  collapsedTeams: Record<string, boolean>;
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
  onToggleTeam: (teamId: string) => void;
  onToggleTeamProjects: (teamId: string) => void;
}

export function SidebarProjectsSection({
  section,
  projectsCollapsed,
  collapsedProjects,
  collapsedTeamProjects,
  collapsedTeams,
  onToggleProjectsCollapsed,
  onToggleProject,
  onToggleTeam,
  onToggleTeamProjects,
}: SidebarProjectsSectionProps) {
  if (section.hierarchyMode === 'teams' && section.teams && section.teams.length > 0) {
    return (
      <TeamsSidebar
        section={section}
        collapsedTeams={collapsedTeams}
        collapsedTeamProjects={collapsedTeamProjects}
        onToggleTeam={onToggleTeam}
        onToggleTeamProjects={onToggleTeamProjects}
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
