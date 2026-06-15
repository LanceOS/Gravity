import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { buildProjectScopedPath } from '../utils/workspaceShellPath';
import type { AppShellRouteState } from '../../../modules/workspaceShellPage/hooks/useAppShellRoute';
import type { Ticket } from '../../../context/TicketContext';
import { type SidebarNavigationState } from '../../../components/Sidebar';
import type { Project } from '../../../types/domain';

interface UseWorkspaceShellNavigationArgs {
  route: Pick<AppShellRouteState, 'teamIdParam' | 'projectIdParam'>;
  activeWorkspaceId: string;
  activeProjectId: string;
  projects: Project[];
  sidebarTree?: { hierarchyMode?: 'flat' | 'teams' };
  activeWorkspaceAvailable: boolean;
  currentUser: { id: string } | null;
  navigate: NavigateFunction;
  setSidebarActiveScope: Dispatch<SetStateAction<SidebarNavigationState['activeScope']>>;
  setActiveProjectId: (projectId: string) => void;
}

interface UseWorkspaceShellNavigationResult {
  buildProjectScopedPath: (projectId: string, scope?: 'tickets' | 'notes', itemId?: string) => string;
  handleSelectProject: (projectId: string) => void;
  handleSelectProjectForManagement: (projectId: string) => void;
  handleShowProjectIssues: () => void;
  handleShowMyIssues: () => void;
  handleSelectCycleLegacy: (cycleId: string) => void;
  handleSelectLabel: (labelId: string) => void;
  handleShowNotes: () => void;
  handleSelectNote: (nextNoteId: string) => void;
  handleSelectTicket: (ticket: Ticket | null) => void;
  handleOpenSettings: () => void;
  handleOpenAccountPreferences: () => void;
  handleOpenProjectManager: () => void;
  handleOpenTeamManager: () => void;
  handleOpenTeamProjectsManager: (teamId: string) => void;
  handleOpenWorkspaceDirectory: () => void;
  handleShowWorkspaceProjectList: () => void;
}

export function useWorkspaceShellNavigation({
  route,
  activeWorkspaceId,
  activeProjectId,
  projects,
  sidebarTree,
  activeWorkspaceAvailable,
  currentUser,
  navigate,
  setSidebarActiveScope,
  setActiveProjectId,
}: UseWorkspaceShellNavigationArgs): UseWorkspaceShellNavigationResult {
  const buildProjectScopedPathCallback = useCallback(
    (projectId: string, scope: 'tickets' | 'notes' = 'tickets', itemId?: string) =>
      buildProjectScopedPath({
        projectId,
        scope,
        itemId,
        activeWorkspaceId,
        projects,
        teamIdParam: route.teamIdParam,
        sidebarTree,
      }),
    [activeWorkspaceId, projects, route.teamIdParam, sidebarTree]
  );

  const handleSelectProject = useCallback((projectId: string) => {
    navigate(buildProjectScopedPathCallback(projectId));
  }, [buildProjectScopedPathCallback, navigate]);

  const handleSelectProjectForManagement = useCallback(
    (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      const wid = project?.workspaceId || activeWorkspaceId;
      setActiveProjectId(projectId);
      setSidebarActiveScope('projects');
      navigate(`/workspaces/${wid}/projects`);
    },
    [activeWorkspaceId, navigate, projects, setActiveProjectId, setSidebarActiveScope]
  );

  const handleShowProjectIssues = useCallback(() => {
    const pid = activeProjectId;
    if (!pid) return;
    navigate(buildProjectScopedPathCallback(pid));
  }, [activeProjectId, buildProjectScopedPathCallback, navigate]);

  const handleShowMyIssues = useCallback(() => {
    const pid = activeProjectId;
    if (!pid || !currentUser) return;
    navigate(`${buildProjectScopedPathCallback(pid)}?assigneeId=${currentUser.id}`);
  }, [activeProjectId, buildProjectScopedPathCallback, currentUser, navigate]);

  const handleSelectCycleLegacy = useCallback(
    (cycleId: string) => {
      const pid = activeProjectId;
      if (!pid) return;
      navigate(`${buildProjectScopedPathCallback(pid)}?cycleId=${cycleId}`);
    },
    [activeProjectId, buildProjectScopedPathCallback, navigate]
  );

  const handleSelectLabel = useCallback(
    (labelId: string) => {
      const pid = activeProjectId;
      if (!pid) return;
      navigate(`${buildProjectScopedPathCallback(pid)}?labels=${labelId}`);
    },
    [activeProjectId, buildProjectScopedPathCallback, navigate]
  );

  const handleShowNotes = useCallback(() => {
    const pid = activeProjectId || route.projectIdParam;
    if (!pid) return;
    navigate(buildProjectScopedPathCallback(pid, 'notes'));
  }, [activeProjectId, buildProjectScopedPathCallback, navigate, route.projectIdParam]);

  const handleSelectNote = useCallback(
    (nextNoteId: string) => {
      const pid = activeProjectId || route.projectIdParam;
      if (!pid) return;

      if (!nextNoteId) {
        navigate(buildProjectScopedPathCallback(pid, 'notes'));
        return;
      }

      navigate(buildProjectScopedPathCallback(pid, 'notes', nextNoteId));
    },
    [activeProjectId, buildProjectScopedPathCallback, navigate, route.projectIdParam]
  );

  const handleSelectTicket = useCallback(
    (ticket: Ticket | null) => {
      if (ticket) {
        navigate(buildProjectScopedPathCallback(ticket.projectId, 'tickets', ticket.key));
        return;
      }

      if (activeProjectId) {
        navigate(buildProjectScopedPathCallback(activeProjectId));
        return;
      }

      navigate(`/workspaces/${activeWorkspaceId}`);
    },
    [activeProjectId, activeWorkspaceId, buildProjectScopedPathCallback, navigate]
  );

  const handleOpenSettings = useCallback(() => {
    if (!activeWorkspaceAvailable) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/settings`);
  }, [activeWorkspaceAvailable, activeWorkspaceId, navigate]);

  const handleOpenAccountPreferences = useCallback(() => {
    navigate('/account');
  }, [navigate]);

  const handleOpenProjectManager = useCallback(() => {
    if (!activeWorkspaceAvailable) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/projects`);
  }, [activeWorkspaceAvailable, activeWorkspaceId, navigate]);

  const handleOpenTeamManager = useCallback(() => {
    if (!activeWorkspaceAvailable) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/teams`);
  }, [activeWorkspaceAvailable, activeWorkspaceId, navigate]);

  const handleOpenTeamProjectsManager = useCallback(
    (teamId: string) => {
      if (!activeWorkspaceAvailable) {
        navigate('/workspaces');
        return;
      }
      navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/projects`);
    },
    [activeWorkspaceAvailable, activeWorkspaceId, navigate]
  );

  const handleOpenWorkspaceDirectory = useCallback(() => {
    navigate('/workspaces');
  }, [navigate]);

  const handleShowWorkspaceProjectList = useCallback(() => {
    navigate(`/workspaces/${activeWorkspaceId}/projects/list`);
  }, [activeWorkspaceId, navigate]);

  return {
    buildProjectScopedPath: buildProjectScopedPathCallback,
    handleSelectProject,
    handleSelectProjectForManagement,
    handleShowProjectIssues,
    handleShowMyIssues,
    handleSelectCycleLegacy,
    handleSelectLabel,
    handleShowNotes,
    handleSelectNote,
    handleSelectTicket,
    handleOpenSettings,
    handleOpenAccountPreferences,
    handleOpenProjectManager,
    handleOpenTeamManager,
    handleOpenTeamProjectsManager,
    handleOpenWorkspaceDirectory,
    handleShowWorkspaceProjectList,
  };
}
