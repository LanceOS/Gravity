import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SidebarNavigationState, SidebarProps } from '../../components/Sidebar';
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout';
import { LocalAIChat } from '../../modules/ai';
import { AuthScreen } from '../../modules/auth';
import type { TicketFilters, TicketListSort } from '../../modules/tickets';
import { TicketDetailRoute, type WorkspaceIssueView } from '../../modules/tickets';
import { OnboardingModal } from '../../modules/onboarding';
import { useTheme, SettingsScreen as SettingsPage } from '../../modules/settings';
import type { Ticket } from '../../context/TicketContext';
import { useTickets } from '../../context/TicketContext';
import { apiClient } from '../../utils/apiClient';
import type { Cycle, Label, SidebarTree } from '../../types/domain';
import { WorkspacePage } from '../WorkspacePage/WorkspacePage';
import { WorkspaceProjectsListPage } from '../WorkspaceProjectsListPage/WorkspaceProjectsListPage';
import { WorkspaceProjectsPage } from '../WorkspaceProjectsPage/WorkspaceProjectsPage';
import { WorkspaceTeamProjectsPage } from '../WorkspaceTeamProjectsPage/WorkspaceTeamProjectsPage';
import { WorkspaceTeamsPage } from '../WorkspaceTeamsPage/WorkspaceTeamsPage';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { AppShellOverlays } from '../AppShellPage/components/AppShellOverlays';
import { useAppShellRoute } from '../AppShellPage/hooks/useAppShellRoute';
import { useAppShellRouteSync } from '../AppShellPage/hooks/useAppShellRouteSync';
import { useWebMcpRegistration } from '../AppShellPage/hooks/useWebMcpRegistration';
import {
  getActiveWorkspaceStorageKey,
  usePendingWorkspaceInvite,
  useWorkspaceMemberActivity,
  useWorkspaceProjectSelection,
} from '../AppShellPage/hooks/useWorkspaceLifecycle';
import { useOllamaPanel } from '../AppShellPage/hooks/useOllamaPanel';
import { useWorkspaceViewMode } from '../AppShellPage/hooks/useWorkspaceViewMode';
import type { AppSection } from '../AppShellPage/AppShellPage.types';
import { LoadingPage } from '../LoadingPage/LoadingPage';

export function WorkspaceShellPage() {
  const {
    activeProjectId,
    activeTicket,
    activeView,
    addComment,
    updateComment,
    deleteComment,
    comments,
    createLabel,
    updateLabel,
    deleteLabel,
    createProject,
    createTicket,
    currentUser,
    cycles,
    deleteProject,
    deleteTicket,
    labels = [],
    filters,
    loading,
    projects,
    setActiveProjectId,
    setActiveTicket,
    setCurrentUser,
    setFilters,
    setTheme,
    setView,
    signOut,
    tickets,
    updateTicket,
    updateProject,
    users,
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTickets();
  const [activeSection, setActiveSection] = useState<AppSection>('workspace');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [activeContext, setActiveContext] = useState<'issues' | 'notes'>('issues');
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isCreateLabelModalOpen, setIsCreateLabelModalOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [sidebarActiveScope, setSidebarActiveScope] = useState<SidebarNavigationState['activeScope']>('workspace');
  const { isOllamaOpen, isOllamaClosing, handleToggleOllama } = useOllamaPanel();
  const [createInitialStatus, setCreateInitialStatus] = useState<Ticket['status'] | undefined>(undefined);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [listSort, setListSort] = useState<TicketListSort>('created');
  const { isMobile } = useWorkspaceViewMode(activeView, setView);
  const [projectCreateLoading, setProjectCreateLoading] = useState(false);
  const [projectCreateErrorState, setProjectCreateErrorState] = useState<{ workspaceId: string; message: string | null }>({
    workspaceId: '',
    message: null,
  });
  const [labelCreateLoading, setLabelCreateLoading] = useState(false);
  const [labelCreateErrorState, setLabelCreateErrorState] = useState<{ projectId: string; message: string | null }>({
    projectId: '',
    message: null,
  });

  const route = useAppShellRoute(currentUser?.id);
  const {
    projectIdParam,
    teamIdParam,
    pathname,
    searchParams,
    setSearchParams,
    navigate,
    isWorkspaceAllTasksPath,
    isTeamAggregatePath,
    shouldUseAggregateTicketScope,
  } = route;
  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
    refreshWorkspaces,
    requestJoinByInvite,
  } = useWorkspaceDirectory({ currentUser, setCurrentUser });
  const workspacesResolvedForCurrentUser = !currentUser || workspacesResolvedUserId === currentUser.id;

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null,
    [activeWorkspaceId, workspaces]
  );
  const activeWorkspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId]
  );
  const parentTicket = useMemo(
    () => (createParentId ? tickets.find((ticket) => ticket.id === createParentId) || null : null),
    [createParentId, tickets]
  );

  const projectCreateError =
    projectCreateErrorState.workspaceId === activeWorkspaceId ? projectCreateErrorState.message : null;
  const labelCreateError = labelCreateErrorState.projectId === activeProjectId ? labelCreateErrorState.message : null;
  const setProjectCreateError = (message: string | null) => {
    setProjectCreateErrorState({ workspaceId: activeWorkspaceId, message });
  };
  const setLabelCreateError = (message: string | null) => {
    setLabelCreateErrorState({ projectId: activeProjectId, message });
  };

  const { data: sidebarTree } = useQuery<SidebarTree>({
    queryKey: ['sidebarTree', activeWorkspaceId],
    queryFn: () => apiClient.get<SidebarTree>(`/workspaces/${activeWorkspaceId}/sidebar`),
    enabled: !!activeWorkspaceId && !!currentUser,
  });

  const { data: workspaceTickets = [] } = useQuery<Ticket[]>({
    queryKey: ['workspaceTickets', activeWorkspaceId],
    queryFn: () => apiClient.get<Ticket[]>('/tickets', { params: { workspaceId: activeWorkspaceId } }),
    enabled: isWorkspaceAllTasksPath && !!activeWorkspaceId && !!currentUser,
  });

  const { data: teamTickets = [] } = useQuery<Ticket[]>({
    queryKey: ['teamTickets', route.teamIdParam],
    queryFn: () => apiClient.get<Ticket[]>('/tickets', { params: { teamId: route.teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
  });

  const { data: teamCycles = [] } = useQuery<Cycle[]>({
    queryKey: ['teamCycles', route.teamIdParam],
    queryFn: () => apiClient.get<Cycle[]>('/cycles', { params: { teamId: route.teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
  });

  const { data: teamLabels = [] } = useQuery<Label[]>({
    queryKey: ['teamLabels', route.teamIdParam],
    queryFn: () => apiClient.get<Label[]>('/labels', { params: { teamId: route.teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
  });

  const routeScopedTickets = useMemo(
    () => (isWorkspaceAllTasksPath ? workspaceTickets : isTeamAggregatePath ? teamTickets : tickets),
    [isTeamAggregatePath, isWorkspaceAllTasksPath, teamTickets, tickets, workspaceTickets]
  );

  useAppShellRouteSync({
    route,
    activeTicket,
    routeScopedTickets,
    setActiveSection,
    setActiveWorkspaceId,
    setActiveContext,
    setActiveNoteId,
    setSidebarActiveScope,
    setActiveProjectId,
    setActiveTicket,
    setFilters,
  });

  const {
    settings: accountSettings,
    ollamaModels,
    savedCredentials: accountSavedCredentials,
  } = useAccountSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme,
  });

  const {
    setDensity,
    setTheme: setDsTheme,
  } = useTheme();
  useEffect(() => {
    if (accountSettings) {
      setDensity(accountSettings.projectLayout === 'condensed' ? 'compact' : 'standard');
      setDsTheme(accountSettings.theme);
    }
  }, [accountSettings, setDensity, setDsTheme]);

  const {
    settings,
    settingsLoading,
    saveLoading: settingsSaveLoading,
    saveSuccess: settingsSaveSuccess,
    saveError: settingsSaveError,
    members: workspaceMembers,
    invites: workspaceInvites,
    invitesLoading: workspaceInvitesLoading,
    joinRequests: workspaceJoinRequests,
    inviteLoading: workspaceInviteLoading,
    inviteError: workspaceInviteError,
    approveLoadingId,
    revokeLoadingId,
    updateSettings,
    saveSettings,
    createInvite,
    revokeInvite,
    approveJoinRequest,
    deleteWorkspace,
    deleteLoading,
    deleteError,
    clearDeleteError,
    updateMemberActivity,
  } = useWorkspaceSettings({
    currentUser,
    activeWorkspaceId,
  });

  usePendingWorkspaceInvite({
    currentUser,
    requestJoinByInvite,
    refreshWorkspaces,
  });

  useWorkspaceMemberActivity({
    activeWorkspaceId,
    currentUser,
    updateMemberActivity,
  });

  useWorkspaceProjectSelection({
    activeWorkspaceId,
    activeWorkspaceDefaultProjectId: activeWorkspace?.defaultProjectId,
    activeWorkspaceProjects,
    activeProjectId,
    setActiveProjectId,
  });

  useWebMcpRegistration({
    tickets,
    users,
    projects,
    createTicket,
    updateTicket,
    addComment,
    addTicketBlocker,
    removeTicketBlocker,
  });

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    const storageKey = getActiveWorkspaceStorageKey(currentUser.id);
    if (!activeWorkspaceId) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, activeWorkspaceId);
  }, [activeWorkspaceId, currentUser]);

  const handleOpenCreateTicket = useCallback((initialStatus?: Ticket['status']) => {
    if (activeWorkspaceProjects.length === 0) {
      return;
    }

    setCreateInitialStatus(initialStatus);
    setCreateParentId(undefined);
    setIsCreateModalOpen(true);
  }, [activeWorkspaceProjects.length]);

  const handleOpenCreateProject = () => {
    setIsCreateProjectModalOpen(true);
  };

  const handleOpenCreateLabel = () => {
    setIsCreateLabelModalOpen(true);
  };

  const handleOpenCreateSubtask = (parentId: string) => {
    setCreateParentId(parentId);
    setCreateInitialStatus(undefined);
    setIsCreateModalOpen(true);
  };

  const buildProjectScopedPath = useCallback(
    (projectId: string, scope: 'tickets' | 'notes' = 'tickets', itemId?: string) => {
      const project = projects.find((item) => item.id === projectId);
      const projectWorkspaceId = project?.workspaceId || activeWorkspaceId;
      const projectTeamId = project?.teamId || route.teamIdParam;
      const basePath =
        (sidebarTree?.hierarchyMode === 'teams' || !!route.teamIdParam) && projectTeamId
          ? `/workspaces/${projectWorkspaceId}/teams/${projectTeamId}/projects/${projectId}/${scope}`
          : `/workspaces/${projectWorkspaceId}/projects/${projectId}/${scope}`;

      return itemId ? `${basePath}/${itemId}` : basePath;
    },
    [activeWorkspaceId, projects, route.teamIdParam, sidebarTree?.hierarchyMode]
  );

  const handleCreateTicketSubmit = async (ticket: {
    title: string;
    description: string;
    status: Ticket['status'];
    priority: Ticket['priority'];
    projectId: string;
    labelIds?: string[];
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }) => {
    const created = await createTicket(ticket);
    return Boolean(created);
  };

  const handleDeleteTicket = async (ticketId: string) => {
    const deletedTicket =
      tickets.find((ticket) => ticket.id === ticketId) || (activeTicket?.id === ticketId ? activeTicket : null);
    await deleteTicket(ticketId);

    if (deletedTicket && activeTicket?.id === ticketId) {
      navigate(buildProjectScopedPath(deletedTicket.projectId), { replace: true });
      return;
    }

    setActiveTicket(null);
  };

  const handleSelectProject = (projectId: string) => {
    navigate(buildProjectScopedPath(projectId));
  };

  const handleSelectProjectForManagement = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const wid = project?.workspaceId || activeWorkspaceId;
    setActiveProjectId(projectId);
    setSidebarActiveScope('projects');
    navigate(`/workspaces/${wid}/projects`);
  };

  const handleCreateProject = async (projectInput: { name: string; description: string; key: string }) => {
    if (!activeWorkspaceId || !currentUser) {
      return;
    }

    setProjectCreateLoading(true);
    setProjectCreateError(null);

    try {
      const project = await createProject({
        ...projectInput,
        status: 'active',
        workspaceId: activeWorkspaceId,
      });

      if (!project) {
        throw new Error('Failed to create project in this workspace.');
      }

      await refreshWorkspaces();
      setActiveTicket(null);
      navigate(`/workspaces/${activeWorkspaceId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project in this workspace.';
      setProjectCreateError(message);
      throw error;
    } finally {
      setProjectCreateLoading(false);
    }
  };

  const handleCreateLabel = async (labelInput: { name: string; color: string; description?: string; sortOrder?: number }) => {
    if (!activeProjectId) {
      return;
    }

    setLabelCreateLoading(true);
    setLabelCreateError(null);

    try {
      const label = await createLabel({
        ...labelInput,
        projectId: activeProjectId,
      });

      if (!label) {
        throw new Error('Failed to create label for this project.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create label for this project.';
      setLabelCreateError(message);
      throw error;
    } finally {
      setLabelCreateLoading(false);
    }
  };

  const handleUpdateLabel = async (
    labelId: string,
    updates: { name?: string; color?: string; description?: string; sortOrder?: number }
  ) => {
    setLabelCreateError(null);
    await updateLabel(labelId, updates);
  };

  const handleDeleteLabel = async (labelId: string) => {
    setLabelCreateError(null);
    const deleted = await deleteLabel(labelId);
    if (!deleted) {
      throw new Error('Failed to delete label.');
    }
  };

  const handleShowProjectIssues = () => {
    const pid = activeProjectId;
    if (!pid) return;
    navigate(buildProjectScopedPath(pid));
  };

  const handleShowMyIssues = () => {
    const pid = activeProjectId;
    if (!pid || !currentUser) return;
    navigate(`${buildProjectScopedPath(pid)}?assigneeId=${currentUser.id}`);
  };

  const handleSelectCycleLegacy = (cycleId: string) => {
    const pid = activeProjectId;
    if (!pid) return;
    navigate(`${buildProjectScopedPath(pid)}?cycleId=${cycleId}`);
  };

  const handleSelectLabel = (labelId: string) => {
    const pid = activeProjectId;
    if (!pid) return;
    navigate(`${buildProjectScopedPath(pid)}?labels=${labelId}`);
  };

  const handleShowNotes = () => {
    const pid = activeProjectId || projectIdParam;
    if (!pid) return;
    navigate(buildProjectScopedPath(pid, 'notes'));
  };

  const handleSelectNote = (nextNoteId: string) => {
    const pid = activeProjectId || projectIdParam;
    if (!pid) return;

    if (!nextNoteId) {
      navigate(buildProjectScopedPath(pid, 'notes'));
      return;
    }

    navigate(buildProjectScopedPath(pid, 'notes', nextNoteId));
  };

  const handleSelectTicket = (ticket: Ticket | null) => {
    if (ticket) {
      navigate(buildProjectScopedPath(ticket.projectId, 'tickets', ticket.key));
      return;
    }

    if (activeProjectId) {
      navigate(buildProjectScopedPath(activeProjectId));
      return;
    }

    navigate(`/workspaces/${activeWorkspaceId}`);
  };

  const handleOpenSettings = () => {
    if (!activeWorkspace) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/settings`);
  };

  const handleOpenAccountPreferences = () => {
    navigate('/account');
  };

  const handleOpenProjectManager = () => {
    if (!activeWorkspace) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/projects`);
  };

  const handleOpenTeamManager = () => {
    if (!activeWorkspace) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/teams`);
  };

  const handleOpenTeamProjectsManager = (teamId: string) => {
    if (!activeWorkspace) {
      navigate('/workspaces');
      return;
    }
    navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/projects`);
  };

  const handleSetFilters = useCallback(
    (updates: Partial<TicketFilters>) => {
      const nextParams = new URLSearchParams(searchParams);
      const merged = { ...filters, ...updates };

      if (merged.labels && merged.labels.length > 0) nextParams.set('labels', merged.labels.join(',')); else nextParams.delete('labels');
      if (merged.labelMode && merged.labelMode !== 'any') nextParams.set('labelMode', merged.labelMode); else nextParams.delete('labelMode');
      if (merged.cycleId) nextParams.set('cycleId', merged.cycleId); else nextParams.delete('cycleId');
      if (merged.labelId) nextParams.set('labelId', merged.labelId); else nextParams.delete('labelId');
      nextParams.delete('domainId');
      if (merged.assigneeId) nextParams.set('assigneeId', merged.assigneeId); else nextParams.delete('assigneeId');
      if (merged.status) nextParams.set('status', merged.status); else nextParams.delete('status');
      if (merged.priority) nextParams.set('priority', merged.priority); else nextParams.delete('priority');
      if (merged.search) nextParams.set('q', merged.search); else nextParams.delete('q');

      const isOnlySearchUpdate = Object.keys(updates).length === 1 && 'search' in updates;
      setSearchParams(nextParams, { replace: isOnlySearchUpdate });
    },
    [filters, searchParams, setSearchParams]
  );

  const handleCreateInvite = async (input: { label: string }) => Boolean(await createInvite(input));
  const handleRevokeInvite = async (inviteId: string) => Boolean(await revokeInvite(inviteId));
  const handleApproveJoinRequest = async (requestId: string) => Boolean(await approveJoinRequest(requestId));

  const handleDeleteWorkspace = useCallback(async () => {
    const success = await deleteWorkspace();
    if (success) {
      setActiveWorkspaceId('');
      navigate('/workspaces');
      await refreshWorkspaces();
    }
  }, [deleteWorkspace, navigate, refreshWorkspaces]);

  const handleOpenWorkspaceDirectory = () => {
    navigate('/workspaces');
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        handleOpenCreateTicket();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeWorkspaceProjects.length, handleOpenCreateTicket]);

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (!activeWorkspace) {
    return <LoadingPage />;
  }

  const onboarding = currentUser.tutorial_completed === 0 || currentUser.tutorial_completed === false ? (
    <OnboardingModal
      onComplete={() => {
        setCurrentUser({ ...currentUser, tutorial_completed: 1 });
      }}
    />
  ) : null;

  const scopedProjects = teamIdParam
    ? activeWorkspaceProjects.filter((project) => project.teamId === teamIdParam || teamIdParam === project.teamId)
    : activeWorkspaceProjects;
  const scopedTickets = isWorkspaceAllTasksPath ? workspaceTickets : isTeamAggregatePath ? teamTickets : tickets;
  const scopedCycles = isTeamAggregatePath ? teamCycles : cycles;
  const scopedLabels = isTeamAggregatePath ? teamLabels : labels;
  const scopedFilters = shouldUseAggregateTicketScope ? { ...filters, projectId: '' } : filters;

  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'done' && ticket.status !== 'canceled'),
    [tickets]
  );
  const myIssuesCount = useMemo(
    () => openTickets.filter((ticket) => ticket.assigneeId === currentUser?.id).length,
    [currentUser?.id, openTickets]
  );
  const labelCounts = useMemo(
    () =>
      Object.fromEntries(
        labels.map((label) => [label.id, openTickets.filter((ticket) => ticket.labelIds?.includes(label.id)).length])
      ),
    [labels, openTickets]
  );
  const cycleCounts = useMemo(
    () =>
      Object.fromEntries(
        cycles.map((cycle) => [cycle.id, openTickets.filter((ticket) => ticket.cycleId === cycle.id).length])
      ),
    [cycles, openTickets]
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === (projectIdParam || activeProjectId)),
    [activeProjectId, projectIdParam, projects]
  );
  const activeProjectTeamId =
    activeProject?.teamId ||
    sidebarTree?.teams?.find((team) => team.projects?.some((project) => project.id === (projectIdParam || activeProjectId)))?.id ||
    '';
  const sidebarActiveTeamId = route.teamIdParam || activeProjectTeamId;
  const activeTeam = sidebarTree?.teams?.find((team) => team.id === sidebarActiveTeamId);
  const activeTeamProjectIds = new Set(activeTeam?.projects?.map((project) => project.id) ?? []);
  const teamProjectsForManager = teamIdParam
    ? activeWorkspaceProjects.filter((project) => project.teamId === teamIdParam || activeTeamProjectIds.has(project.id))
    : [];
  const isTeamProjectsManager = activeSection === 'team-projects';
  const isTeamWorkspace = (sidebarTree?.hierarchyMode ?? activeWorkspace.hierarchyMode) === 'teams';
  const isTeamsManager = activeSection === 'teams' || (isTeamWorkspace && activeSection === 'projects');
  const isWorkspaceOwner = activeWorkspace.memberRole === 'owner';

  const handleOpenCurrentTeamProjectsManager = () => {
    if (sidebarActiveTeamId) {
      handleOpenTeamProjectsManager(sidebarActiveTeamId);
      return;
    }

    handleOpenTeamManager();
  };

  const sidebarNavigationState: SidebarNavigationState = {
    activeTeam: sidebarActiveTeamId,
    activeScope:
      route.teamIdParam
        ? route.projectIdParam
          ? 'projects'
          : route.cycleIdParam
            ? 'cycles'
            : route.activeLabelIdParam
              ? 'labels'
              : 'views'
        : route.projectIdParam
          ? 'projects'
          : 'workspace',
    activeProject:
      activeSection === 'projects' || activeSection === 'team-projects' || activeSection === 'workspace'
        ? (projectIdParam || activeProjectId)
        : '',
  };

  const sidebarActiveViewId =
    route.teamIdParam && sidebarNavigationState.activeScope === 'views'
      ? (route.viewIdParam || 'all')
      : '';
  const isTimelineAggregatePath = isTeamAggregatePath && route.viewIdParam === 'timeline';
  const effectiveActiveView: WorkspaceIssueView = isTimelineAggregatePath ? 'timeline' : activeView;
  const lockWorkspaceIssueView = isTimelineAggregatePath;

  const sidebarProps: SidebarProps = {
    workspace: {
      workspaces,
      activeWorkspaceId,
      onSelectWorkspace: (workspaceId) => {
        navigate(`/workspaces/${workspaceId}`);
      },
      onOpenWorkspaceDirectory: handleOpenWorkspaceDirectory,
    },
    projects: {
      hierarchyMode: sidebarTree?.hierarchyMode,
      teams: sidebarTree?.teams,
      navigationState: sidebarNavigationState,
      activeViewId: sidebarActiveViewId,
      activeTeamId: sidebarActiveTeamId,
      activeCycleId: route.cycleIdParam,
      activeLabelId: route.activeLabelIdParam,
      onSelectWorkspaceAllTasks: () => navigate(`/workspaces/${activeWorkspaceId}/all`),
      onSelectWorkspaceProjects: () => navigate(`/workspaces/${activeWorkspaceId}/projects/list`),
      onSelectTeam: (teamId) => navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/tasks`),
      onSelectView: (teamId, viewId) => {
        if (viewId === 'all') {
          navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/tasks`);
          return;
        }
        navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/views/${viewId}`);
      },
      onSelectCycle: (teamId, cycleId) => navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/cycles/${cycleId}`),
      onSelectTeamLabel: (teamId, labelId) => navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/labels/${labelId}`),
      onSelectAllTasks: (teamId) => navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/tasks`),
      projects: activeWorkspaceProjects,
      labels,
      cycles,
      currentUser,
      activeProjectId,
      filters,
      counts: {
        myIssues: myIssuesCount,
        activeProjectIssues: openTickets.length,
        labels: labelCounts,
        cycles: cycleCounts,
      },
      activeContext,
      onSelectProject: handleSelectProject,
      onShowProjectIssues: handleShowProjectIssues,
      onShowMyIssues: handleShowMyIssues,
      onShowNotes: handleShowNotes,
      onSelectCycleLegacy: handleSelectCycleLegacy,
      onSelectLabel: handleSelectLabel,
      isWorkspaceOwner,
      onOpenTeamManager: handleOpenTeamManager,
      onOpenCreateTeam: () => navigate(`/workspaces/${activeWorkspaceId}/teams?create=true`),
    },
    tools: {
      onOpenOllama: handleToggleOllama,
      isOllamaOpen,
      onOpenSimulator: () => {},
      onOpenCreateTicket: handleOpenCreateTicket,
      onOpenCreateProject: handleOpenCreateProject,
      onOpenCreateLabel: handleOpenCreateLabel,
      agentIntegration: accountSettings.agentIntegration,
      aiProvider: accountSettings.aiProvider,
    },
    userMenu: {
      currentUser,
      activeArea:
        isTeamsManager || isTeamProjectsManager
          ? 'teams'
          : activeSection === 'projects'
            ? 'projects'
            : 'workspace',
      showWorkspaceManagement: !isTeamWorkspace || isWorkspaceOwner,
      workspaceManagementLabel: isTeamWorkspace ? 'Manage Teams' : 'Manage Projects',
      workspaceManagementArea: isTeamWorkspace ? 'teams' : 'projects',
      onOpenWorkspaceDirectory: handleOpenWorkspaceDirectory,
      onOpenAccountPreferences: handleOpenAccountPreferences,
      onOpenProjectManager: isTeamWorkspace ? handleOpenTeamManager : handleOpenProjectManager,
      onOpenSettings: handleOpenSettings,
      onOpenMcp: () => setIsMcpOpen(true),
      onSignOut: signOut,
    },
  };

  if (activeSection === 'settings') {
    return (
      <>
        <SettingsPage
          currentUser={currentUser}
          workspace={activeWorkspace!}
          settings={settings}
          settingsLoading={settingsLoading}
          saveLoading={settingsSaveLoading}
          saveSuccess={settingsSaveSuccess}
          saveError={settingsSaveError}
          inviteError={workspaceInviteError}
          invitesLoading={workspaceInvitesLoading}
          inviteLoading={workspaceInviteLoading}
          invites={workspaceInvites}
          members={workspaceMembers}
          joinRequests={workspaceJoinRequests}
          approveLoadingId={approveLoadingId || null}
          revokeLoadingId={revokeLoadingId || null}
          deleteLoading={deleteLoading}
          deleteError={deleteError}
          onBackToWorkspace={() => navigate(`/workspaces/${activeWorkspaceId}`)}
          onOpenDirectory={() => navigate('/workspaces')}
          onChangeSettings={updateSettings}
          onSaveSettings={saveSettings}
          onCreateInvite={handleCreateInvite}
          onRevokeInvite={handleRevokeInvite}
          onApproveJoinRequest={handleApproveJoinRequest}
          onDeleteWorkspace={handleDeleteWorkspace}
          onClearDeleteError={clearDeleteError}
        />
        {onboarding}
      </>
    );
  }

  const createDefaultProjectId =
    activeProjectId || scopedProjects[0]?.id || activeWorkspaceProjects[0]?.id || '';

  return (
    <>
      <WorkspaceLayout
        sidebarProps={sidebarProps}
        isMobile={isMobile}
        rightPanels={
          isOllamaOpen || isOllamaClosing ? (
            <LocalAIChat
              onClose={handleToggleOllama}
              initialOllamaUrl={accountSettings.ollamaEndpoint}
              initialModel={
                accountSettings.agentIntegration === 'third_party'
                  ? (accountSavedCredentials.find((c) => c.provider === accountSettings.aiProvider)?.preferredModel || '')
                  : (accountSettings.ollamaModel || ollamaModels[0] || '')
              }
              settings={accountSettings}
              workspaceId={activeWorkspaceId}
              isClosing={isOllamaClosing}
            />
          ) : null
        }
      >
        {sidebarActiveScope === 'workspace-projects' ? (
          <WorkspaceProjectsListPage />
        ) : isTeamsManager ? (
          <WorkspaceTeamsPage
            workspaceId={activeWorkspaceId}
            workspaceName={activeWorkspace.name}
            teams={sidebarTree?.teams ?? []}
            loading={!sidebarTree}
            onBackToWorkspace={() => navigate(`/workspaces/${activeWorkspaceId}`)}
            onManageProjects={handleOpenTeamProjectsManager}
            onTeamsChanged={async () => {
              await refreshWorkspaces();
            }}
          />
        ) : isTeamProjectsManager ? (
          <WorkspaceTeamProjectsPage
            workspaceId={activeWorkspaceId}
            workspaceName={activeWorkspace.name}
            team={activeTeam ?? null}
            projects={teamProjectsForManager}
            activeProjectId={activeProjectId}
            loading={!sidebarTree || !activeTeam}
            onBackToTeams={() => navigate(`/workspaces/${activeWorkspaceId}/teams`)}
            onCreateProject={async (project) => {
              await handleCreateProject(project);
              return null;
            }}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : activeSection === 'projects' ? (
          <WorkspaceProjectsPage
            workspaceName={activeWorkspace.name}
            projects={activeWorkspaceProjects}
            activeProjectId={activeProjectId}
            defaultProjectId={activeWorkspace.defaultProjectId ?? null}
            labels={scopedLabels}
            projectCreateLoading={projectCreateLoading}
            projectCreateError={projectCreateError}
            labelCreateLoading={labelCreateLoading}
            labelCreateError={labelCreateError}
            onBackToWorkspace={() => navigate(`/workspaces/${activeWorkspaceId}`)}
            onCreateProject={handleCreateProject}
            onUpdateProject={updateProject}
            onCreateLabel={handleCreateLabel}
            onUpdateLabel={handleUpdateLabel}
            onDeleteLabel={handleDeleteLabel}
            onSelectProject={handleSelectProjectForManagement}
          />
        ) : route.ticketKey ? (
          <TicketDetailRoute
            activeWorkspaceId={activeWorkspaceId}
            activeTicket={
              route.ticketKey ? (scopedTickets.find((ticket) => ticket.key === route.ticketKey) || activeTicket) : activeTicket
            }
            activeTicketDetail={activeTicketDetail}
            comments={comments}
            tickets={scopedTickets}
            users={users}
            projects={activeWorkspaceProjects}
            labels={scopedLabels}
            cycles={scopedCycles}
            onSelectTicket={handleSelectTicket}
            onUpdateTicket={updateTicket}
            onDeleteTicket={handleDeleteTicket}
            onAddComment={addComment}
            onUpdateComment={updateComment}
            onDeleteComment={deleteComment}
            onOpenCreateSubtask={handleOpenCreateSubtask}
            onAddDependency={addTicketDependency}
            onRemoveDependency={removeTicketDependency}
            onAddBlocker={addTicketBlocker}
            onRemoveBlocker={removeTicketBlocker}
          />
        ) : (
          <WorkspacePage
            workspaceId={activeWorkspaceId}
            workspaceName={activeWorkspace.name}
            pathname={pathname}
            activeContext={activeContext}
            activeTicket={activeTicket}
            activeView={effectiveActiveView}
            viewModeLocked={lockWorkspaceIssueView}
            isTeamWorkspace={isTeamWorkspace}
            hasTeams={!!(sidebarTree?.teams?.length)}
            currentUser={currentUser}
            cycles={scopedCycles}
            labels={scopedLabels}
            filters={scopedFilters}
            listSort={listSort}
            projects={scopedProjects}
            tickets={scopedTickets}
            users={users}
            onOpenCreateTicket={handleOpenCreateTicket}
            onOpenProjectManager={handleOpenProjectManager}
            onOpenTeamManager={handleOpenTeamManager}
            onSelectTicket={(ticket) => {
              if (ticket) {
                navigate(buildProjectScopedPath(ticket.projectId, 'tickets', ticket.key));
              } else if (activeProjectId) {
                navigate(buildProjectScopedPath(activeProjectId));
              } else {
                navigate(`/workspaces/${activeWorkspaceId}`);
              }
            }}
            onSelectNote={handleSelectNote}
            activeNoteId={activeNoteId}
            onSetFilters={handleSetFilters}
            onSetListSort={setListSort}
            onSetView={setView}
            onUpdateTicket={updateTicket}
            onOpenTeamProjectManager={handleOpenCurrentTeamProjectsManager}
          />
        )}
      </WorkspaceLayout>

      <AppShellOverlays
        onboarding={onboarding}
        createTicket={{
          isOpen: isCreateModalOpen,
          onClose: () => setIsCreateModalOpen(false),
          projects: activeWorkspaceProjects,
          labels: scopedLabels,
          cycles: scopedCycles,
          users,
          parentTicket,
          defaultProjectId: createDefaultProjectId,
          onSubmitTicket: handleCreateTicketSubmit,
          initialStatus: createInitialStatus,
          parentId: createParentId,
        }}
        mcp={{
          isOpen: isMcpOpen,
          workspaceId: activeWorkspaceId,
          onClose: () => setIsMcpOpen(false),
        }}
        createProject={{
          isOpen: isCreateProjectModalOpen,
          loading: projectCreateLoading,
          errorMessage: projectCreateError,
          onClose: () => setIsCreateProjectModalOpen(false),
          onSubmitProject: async (project) => {
            await createProject(project);
            setIsCreateProjectModalOpen(false);
          },
        }}
        createLabel={{
          isOpen: isCreateLabelModalOpen,
          loading: labelCreateLoading,
          errorMessage: labelCreateError,
          onClose: () => setIsCreateLabelModalOpen(false),
          onSubmitLabel: async (label) => {
            await createLabel({ ...label, projectId: activeProjectId });
            setIsCreateLabelModalOpen(false);
          },
        }}
      />
    </>
  );
}
