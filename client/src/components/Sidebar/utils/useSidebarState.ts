import { useEffect, useRef, useState } from 'react';

export function useSidebarState(activeProjectId: string, onSelectProject: (projectId: string) => void) {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedTeamProjects, setCollapsedTeamProjects] = useState<Record<string, boolean>>({});
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleProject = (projectId: string) => {
    if (projectId !== activeProjectId) {
      onSelectProject(projectId);
      setCollapsedProjects((previous) => ({ ...previous, [projectId]: false }));
      return;
    }

    setCollapsedProjects((previous) => ({ ...previous, [projectId]: !previous[projectId] }));
  };

  return {
    collapsedProjects,
    collapsedTeamProjects,
    profileRef,
    projectsCollapsed,
    showUserDropdown,
    closeUserDropdown: () => setShowUserDropdown(false),
    toggleProject,
    toggleTeamProjects: (teamId: string) => {
      setCollapsedTeamProjects((previous) => ({ ...previous, [teamId]: !previous[teamId] }));
    },
    toggleProjectsCollapsed: () => setProjectsCollapsed((previous) => !previous),
    toggleUserDropdown: () => setShowUserDropdown((previous) => !previous),
  };
}
