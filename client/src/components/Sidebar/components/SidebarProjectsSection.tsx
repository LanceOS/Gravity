import type { SidebarProjectSection } from '../types';
import { TeamsSidebar } from '../teams';
import { IndividualsSidebar } from '../individuals';

interface SidebarProjectsSectionProps {
  section: SidebarProjectSection;
  projectsCollapsed: boolean;
  collapsedProjects: Record<string, boolean>;
  collapsedTeamProjects: Record<string, boolean>;
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
  onToggleTeamProjects: (teamId: string) => void;
}

export function SidebarProjectsSection({
  section,
  projectsCollapsed,
  collapsedProjects,
  collapsedTeamProjects,
  onToggleProjectsCollapsed,
  onToggleProject,
  onToggleTeamProjects,
}: SidebarProjectsSectionProps) {
  if (section.hierarchyMode === 'teams' && section.teams && section.teams.length > 0) {
    return (
      <TeamsSidebar
        section={section}
        collapsedTeamProjects={collapsedTeamProjects}
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
