import { useOptionalSidebarContext } from '../context/SidebarContext';
import type { SidebarProjectSection } from '../types';
import { TeamsSidebar } from '../teams';
import { IndividualsSidebar } from '../individuals';

interface SidebarProjectsSectionProps {
  section?: SidebarProjectSection;
  projectsCollapsed?: boolean;
  collapsedProjects?: Record<string, boolean>;
  collapsedTeamProjects?: Record<string, boolean>;
  collapsedTeams?: Record<string, boolean>;
  onToggleProjectsCollapsed?: () => void;
  onToggleProject?: (projectId: string) => void;
  onToggleTeam?: (teamId: string) => void;
  onToggleTeamProjects?: (teamId: string) => void;
}

export function SidebarProjectsSection(props: SidebarProjectsSectionProps) {
  const context = useOptionalSidebarContext();
  const section = props.section ?? context?.section;

  if (!section) {
    throw new Error('SidebarProjectsSection requires a section prop or SidebarProvider context');
  }

  if (section.hierarchyMode === 'teams') {
    return (
      <TeamsSidebar
        section={section}
        collapsedTeams={props.collapsedTeams}
        collapsedTeamProjects={props.collapsedTeamProjects}
        onToggleTeam={props.onToggleTeam}
        onToggleTeamProjects={props.onToggleTeamProjects}
      />
    );
  }

  return (
    <IndividualsSidebar
      section={section}
      collapsedProjects={props.collapsedProjects}
      onToggleProject={props.onToggleProject}
    />
  );
}
