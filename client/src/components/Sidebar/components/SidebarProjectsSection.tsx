import type { SidebarProjectSection } from '../types';
import { TeamsSidebar } from '../teams';
import { IndividualsSidebar } from '../individuals';

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
  if (section.hierarchyMode === 'teams' && section.teams && section.teams.length > 0) {
    return <TeamsSidebar section={section} />;
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
