import { useEffect, useRef, useState, type RefObject } from 'react';

const PROJECT_EXPAND_DELAY_MS = 200; // Matches --transition-normal so the accordion finishes opening first.

export interface SidebarViewModel {
  collapsedProjects: Record<string, boolean>;
  collapsedTeams: Record<string, boolean>;
  collapsedTeamProjects: Record<string, boolean>;
  projectsCollapsed: boolean;
  showUserDropdown: boolean;
  profileRef: RefObject<HTMLDivElement | null>;
  closeUserDropdown: () => void;
  toggleProject: (projectId: string) => void;
  toggleProjectsCollapsed: () => void;
  toggleTeam: (teamId: string) => void;
  toggleTeamProjects: (teamId: string) => void;
  toggleUserDropdown: () => void;
}

export function useSidebarViewModel(
  activeProjectId: string,
  activeTeamId: string,
  onSelectProject: (projectId: string) => void,
  onSelectTeam?: (teamId: string) => void,
  onPrefetchProject?: (projectId: string) => void | Promise<void>,
  onHasCachedProjectData?: (projectId: string) => boolean,
): SidebarViewModel {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedTeamProjects, setCollapsedTeamProjects] = useState<Record<string, boolean>>({});
  const pendingProjectSelectionRef = useRef<{ projectId: string; timeoutId: number } | null>(null);
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

  useEffect(() => {
    return () => {
      if (pendingProjectSelectionRef.current) {
        window.clearTimeout(pendingProjectSelectionRef.current.timeoutId);
        pendingProjectSelectionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    setCollapsedProjects((previous) => {
      if (previous[activeProjectId] !== undefined) {
        return previous;
      }

      return { ...previous, [activeProjectId]: false };
    });
  }, [activeProjectId]);

  const cancelPendingProjectSelection = (collapsePendingProject = false) => {
    const pending = pendingProjectSelectionRef.current;
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeoutId);
    if (collapsePendingProject) {
      setCollapsedProjects((previous) => ({ ...previous, [pending.projectId]: true }));
    }
    pendingProjectSelectionRef.current = null;
  };

  const toggleProject = (projectId: string) => {
    if (projectId !== activeProjectId) {
      const isProjectCached = onHasCachedProjectData?.(projectId) ?? false;
      const pending = pendingProjectSelectionRef.current;
      if (pending?.projectId === projectId) {
        window.clearTimeout(pending.timeoutId);
        pendingProjectSelectionRef.current = null;
        setCollapsedProjects((previous) => ({ ...previous, [projectId]: true }));
        return;
      }

      if (pending) {
        window.clearTimeout(pending.timeoutId);
        setCollapsedProjects((previous) => ({ ...previous, [pending.projectId]: true }));
      }

      setCollapsedProjects((previous) => ({ ...previous, [projectId]: false }));
      if (isProjectCached) {
        onSelectProject(projectId);
        return;
      }

      pendingProjectSelectionRef.current = {
        projectId,
        timeoutId: window.setTimeout(() => {
          pendingProjectSelectionRef.current = null;
          void onPrefetchProject?.(projectId);
          onSelectProject(projectId);
        }, PROJECT_EXPAND_DELAY_MS),
      };
      return;
    }

    cancelPendingProjectSelection(true);
    setCollapsedProjects((previous) => ({ ...previous, [projectId]: !previous[projectId] }));
  };

  const toggleTeam = (teamId: string) => {
    if (teamId !== activeTeamId) {
      onSelectTeam?.(teamId);
      setCollapsedTeams((previous) => ({ ...previous, [teamId]: false }));
      return;
    }

    setCollapsedTeams((previous) => ({ ...previous, [teamId]: !previous[teamId] }));
  };

  return {
    collapsedProjects,
    collapsedTeams,
    collapsedTeamProjects,
    profileRef,
    projectsCollapsed,
    showUserDropdown,
    closeUserDropdown: () => setShowUserDropdown(false),
    toggleProject,
    toggleTeam,
    toggleTeamProjects: (teamId: string) => {
      setCollapsedTeamProjects((previous) => ({ ...previous, [teamId]: !previous[teamId] }));
    },
    toggleProjectsCollapsed: () => setProjectsCollapsed((previous) => !previous),
    toggleUserDropdown: () => setShowUserDropdown((previous) => !previous),
  };
}
