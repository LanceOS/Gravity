import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { SidebarNavigationState, SidebarProps } from '../../../components/Sidebar';
import { WorkspaceLayout } from '../../../layouts/WorkspaceLayout/WorkspaceLayout';
import { LocalAIChat } from '../../ai';
import { Button } from '@library';
import { AuthScreen } from '../../auth';
import type { TicketListSort } from '../../tickets';
import { TicketDetailRoute, type WorkspaceIssueView } from '../../tickets';
import { OnboardingModal } from '../../onboarding';
import { useTheme } from '../../settings';
import type { Ticket } from '../../../context/TicketContext';
import { useTickets } from '../../../context/TicketContext';
import { apiClient } from '../../../utils/apiClient';
import type { Cycle, Label, SidebarTree } from '../../../types/domain';
import { WorkspacePage } from '../../workspacePage';
import { WorkspaceProjectsListPage } from '../../workspaceProjectsListPage';
import { WorkspaceTeamsPage } from '../../workspaceTeamsPage';
import { useAccountSettings } from '../../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../../hooks/useWorkspaceDirectory';
import { AppShellOverlays } from '../components/AppShellOverlays';
import { useAppShellRoute } from '../hooks/useAppShellRoute';
import { useAppShellRouteSync } from '../hooks/useAppShellRouteSync';
import { useWebMcpRegistration } from '../hooks/useWebMcpRegistration';
import {
  usePendingWorkspaceInvite,
  useWorkspaceMemberActivity,
  useWorkspaceProjectSelection,
} from '../hooks/useWorkspaceLifecycle';
import { useOllamaPanel } from '../hooks/useOllamaPanel';
import { useWorkspaceViewMode } from '../hooks/useWorkspaceViewMode';
import { useWorkspaceDirectoryState } from '../hooks/useWorkspaceDirectoryState';
import type { AppSection } from '../types/AppShell';
import { LoadingPage } from '../../loadingPage';
import { queryClient, queryKeys } from '../../../utils/queryClient';
import {
  useActiveWorkspaceStorage,
  useWorkspaceCreateLabelDialog,
  useWorkspaceCreateProjectDialog,
  useWorkspaceCreateTicketDialog,
  useWorkspaceShellCommands,
  useWorkspaceShellFilters,
  useWorkspaceShellNavigation,
  useWorkspaceSidebarCounts,
  WorkspaceHeader,
  WorkspaceProjectPanel,
  WorkspaceTeamProjectsPanel,
} from '../../workspaces';
import '../../workspaceProjectsPanel/styles/WorkspaceProjectsPage.css';
import '../../workspacePage/styles/WorkspacePage.css';
interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  createdAt: string;
  lastActiveAt?: string | null;
}

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
  const activeProject = useMemo(
    () => projects.find((project) => project.id === (projectIdParam || activeProjectId)),
    [activeProjectId, projectIdParam, projects]
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
    setDensity,
    theme,
    setTheme: setDsTheme,
  } = useTheme();

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
  useEffect(() => {
    if (accountSettings) {
      setDensity(accountSettings.projectLayout === 'condensed' ? 'compact' : 'standard');
      setDsTheme(accountSettings.theme);
    }
  }, [accountSettings, setDensity, setDsTheme]);

  const updateMemberActivity = useCallback((userId: string, lastActiveAt: string) => {
    if (!activeWorkspaceId) {
      return;
    }

    queryClient.setQueryData<WorkspaceMember[]>(queryKeys.workspaceMembers(activeWorkspaceId), (old) =>
      old ? old.map((member) => (member.id === userId ? { ...member, lastActiveAt } : member)) : []
    );
  }, [activeWorkspaceId]);

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

  useActiveWorkspaceStorage({
    currentUser,
    activeWorkspaceId,
  });

  const {
    buildProjectScopedPath,
    handleOpenWorkspaceDirectory,
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
    handleShowWorkspaceProjectList,
  } = useWorkspaceShellNavigation({
    route: { teamIdParam, projectIdParam },
    activeWorkspaceId,
    activeProjectId,
    projects: activeWorkspaceProjects,
    sidebarTree,
    activeWorkspaceAvailable: !!activeWorkspace,
    currentUser,
    navigate,
    setSidebarActiveScope,
    setActiveProjectId,
  });

  const {
    handleCreateTicketSubmit,
    handleDeleteTicket,
    handleCreateProject,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  } = useWorkspaceShellCommands({
    activeWorkspaceId,
    currentUser,
    tickets,
    activeTicket,
    activeProjectId,
    createTicket,
    deleteTicket,
    createProject,
    refreshWorkspaces,
    createLabel,
    updateLabel,
    deleteLabel,
    setActiveTicket,
    setProjectCreateLoading,
    setProjectCreateError,
    setLabelCreateLoading,
    setLabelCreateError,
    navigate,
    buildProjectScopedPath,
  });

  const { handleSetFilters } = useWorkspaceShellFilters({
    filters,
    searchParams,
    setSearchParams,
  });

  const { handleOpenCreateTicket, handleOpenCreateSubtask } = useWorkspaceCreateTicketDialog({
    hasActiveWorkspaceProjects: activeWorkspaceProjects.length > 0,
    setCreateInitialStatus,
    setCreateParentId,
    setIsCreateModalOpen,
  });

  const { handleOpenCreateProject } = useWorkspaceCreateProjectDialog({
    setIsCreateProjectModalOpen,
  });

  const { handleOpenCreateLabel } = useWorkspaceCreateLabelDialog({
    setIsCreateLabelModalOpen,
  });

  const { openTickets, myIssuesCount, labelCounts, cycleCounts } = useWorkspaceSidebarCounts({
    tickets,
    labels,
    cycles,
    currentUserId: currentUser?.id,
  });

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

  const activeProjectTeamId =
    activeProject?.teamId ||
    sidebarTree?.teams?.find((team) => team.projects?.some((project) => project.id === (projectIdParam || activeProjectId)))?.id ||
    '';
  const sidebarActiveTeamId = route.teamIdParam || activeProjectTeamId;
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
      onSelectWorkspaceProjects: handleShowWorkspaceProjectList,
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
          <WorkspaceTeamProjectsPanel
            workspaceId={activeWorkspaceId}
            workspaceName={activeWorkspace.name}
            projects={activeWorkspaceProjects}
            teamId={teamIdParam}
            sidebarTree={sidebarTree}
            activeProjectId={activeProjectId}
            onBackToTeams={() => navigate(`/workspaces/${activeWorkspaceId}/teams`)}
            onCreateProject={async (project) => {
              await handleCreateProject(project);
            }}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : activeSection === 'projects' ? (
          <div className="workspace-page workspace-projects-page">
            <WorkspaceHeader>
              <WorkspaceHeader.Top>
                <WorkspaceHeader.Title>Manage Projects</WorkspaceHeader.Title>

                <div className="workspace-projects-page__actions">
                  <Button type="button" variant="ghost" size="sm" onClick={() => navigate(`/workspaces/${activeWorkspaceId}`)}>
                    <ArrowLeft size={14} />
                    <span>Back to Workspace</span>
                  </Button>
                </div>
              </WorkspaceHeader.Top>
            </WorkspaceHeader>

            <div className="workspace-projects-page__content">
              <WorkspaceProjectPanel
                workspaceName={activeWorkspace.name}
                projects={activeWorkspaceProjects}
                activeProjectId={activeProjectId}
                defaultProjectId={activeWorkspace.defaultProjectId ?? null}
                labels={scopedLabels}
                projectCreateLoading={projectCreateLoading}
                projectCreateError={projectCreateError}
                labelCreateLoading={labelCreateLoading}
                labelCreateError={labelCreateError}
                onSelectProject={handleSelectProjectForManagement}
                onCreateProject={handleCreateProject}
                onUpdateProject={updateProject}
                onCreateLabel={handleCreateLabel}
                onUpdateLabel={handleUpdateLabel}
                onDeleteLabel={handleDeleteLabel}
              />
            </div>
          </div>
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
            onSelectTicket={handleSelectTicket}
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
              await handleCreateProject(project);
              setIsCreateProjectModalOpen(false);
            },
          }}
          createLabel={{
            isOpen: isCreateLabelModalOpen,
            loading: labelCreateLoading,
            errorMessage: labelCreateError,
            onClose: () => setIsCreateLabelModalOpen(false),
            onSubmitLabel: async (label) => {
              await handleCreateLabel(label);
              setIsCreateLabelModalOpen(false);
            },
          }}
      />
    </>
  );
}
