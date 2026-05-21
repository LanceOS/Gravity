import { useEffect, useMemo, useState } from 'react';
import { AgentSimulator } from '../../components/AgentSimulator';
import { AuthScreen } from '../../components/AuthScreen';
import { CreateTicketModal } from '../../components/CreateTicketModal';
import { LocalAIChat } from '../../components/LocalAIChat';
import { OnboardingModal } from '../../components/OnboardingModal';
import type { SidebarProps } from '../../components/Sidebar';
import { useTickets, type Ticket } from '../../context/TicketContext';
import { useTheme } from '../../context/ThemeProvider';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout';
import { AccountPreferencesPage } from '../AccountPreferencesPage/AccountPreferencesPage';
import type { TicketListSort } from '../../utils/ticketView';
import { registerWebMCPTools } from '../../utils/webmcp';
import { LoadingPage } from '../LoadingPage/LoadingPage';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { WorkspaceDirectoryPage } from '../WorkspaceDirectoryPage/WorkspaceDirectoryPage';
import { WorkspacePage } from '../WorkspacePage/WorkspacePage';
import { WorkspaceProjectsPage } from '../WorkspaceProjectsPage/WorkspaceProjectsPage';

type AppSection = 'directory' | 'workspace' | 'settings' | 'account' | 'projects';

function getActiveWorkspaceStorageKey(userId: string) {
  return `gravity_active_workspace:${userId}`;
}

export function AppShellPage() {
  const {
    activeProjectId,
    activeTicket,
    activeView,
    addComment,
    comments,
    createDomain,
    createProject,
    createTicket,
    currentUser,
    cycles,
    deleteTicket,
    domains,
    fetchInitialData,
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
    theme,
    tickets,
    updateTicket,
    users,
  } = useTickets();

  const [activeSection, setActiveSection] = useState<AppSection>('workspace');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOllamaOpen, setIsOllamaOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<Ticket['status'] | undefined>(undefined);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [listSort, setListSort] = useState<TicketListSort>('created');
  const [projectCreateLoading, setProjectCreateLoading] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [domainCreateLoading, setDomainCreateLoading] = useState(false);
  const [domainCreateError, setDomainCreateError] = useState<string | null>(null);

  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
    pendingAction,
    error: workspaceDirectoryError,
    successMessage: workspaceDirectorySuccess,
    refreshWorkspaces,
    createWorkspace,
    requestJoinByInvite,
    validatePeerInvite,
  } = useWorkspaceDirectory({ currentUser, setCurrentUser });
  const workspacesResolvedForCurrentUser = !currentUser || workspacesResolvedUserId === currentUser.id;

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null,
    [workspaces, activeWorkspaceId]
  );
  const activeWorkspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId]
  );
  const parentTicket = useMemo(
    () => (createParentId ? tickets.find((ticket) => ticket.id === createParentId) || null : null),
    [tickets, createParentId]
  );
  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'done' && ticket.status !== 'canceled'),
    [tickets]
  );
  const myIssuesCount = useMemo(
    () => openTickets.filter((ticket) => ticket.assigneeId === currentUser?.id).length,
    [openTickets, currentUser]
  );
  const domainCounts = useMemo(
    () =>
      Object.fromEntries(
        domains.map((domain) => [domain.id, openTickets.filter((ticket) => ticket.domainId === domain.id).length])
      ),
    [domains, openTickets]
  );
  const cycleCounts = useMemo(
    () =>
      Object.fromEntries(
        cycles.map((cycle) => [cycle.id, openTickets.filter((ticket) => ticket.cycleId === cycle.id).length])
      ),
    [cycles, openTickets]
  );
  const {
    settings: accountSettings,
    settingsLoading: accountSettingsLoading,
    saveLoading: accountSaveLoading,
    saveSuccess: accountSaveSuccess,
    saveError: accountSaveError,
    testing: accountTesting,
    testResult: accountTestResult,
    tutorialResult: accountTutorialResult,
    ollamaModels,
    ollamaModelsLoading,
    updateSettings: updateAccountSettings,
    saveSettings: saveAccountSettings,
    testApiKey,
    resetTutorial,
    refreshOllamaModels,
  } = useAccountSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme,
  });
  const { setDensity, setTheme: setDsTheme } = useTheme();

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
    federationConnections,
    connectionsLoading,
    connectionsError,
    retryingConnectionId,
    approveLoadingId,
    revokeLoadingId,
    updateSettings,
    saveSettings,
    createInvite,
    revokeInvite,
    approveJoinRequest,
    retryFederationConnection,
  } = useWorkspaceSettings({
    currentUser,
    activeWorkspaceId,
  });

  useEffect(() => {
    if (!currentUser) {
      setActiveSection('workspace');
      setActiveWorkspaceId('');
      setWorkspaceReady(false);
      return;
    }

    if (!workspacesResolvedForCurrentUser || workspacesLoading) {
      return;
    }

    if (workspaces.length === 0) {
      setActiveWorkspaceId('');
      setWorkspaceReady(true);
      setActiveSection((current) => (current === 'account' ? current : 'directory'));
      return;
    }

    if (!activeWorkspaceId || !workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      const storedWorkspaceId =
        typeof window === 'undefined' ? null : window.localStorage.getItem(getActiveWorkspaceStorageKey(currentUser.id));
      const nextWorkspaceId =
        storedWorkspaceId && workspaces.some((workspace) => workspace.id === storedWorkspaceId)
          ? storedWorkspaceId
          : workspaces[0].id;

      if (nextWorkspaceId !== activeWorkspaceId) {
        setActiveWorkspaceId(nextWorkspaceId);
      }
    }

    setWorkspaceReady(true);
  }, [currentUser, workspacesResolvedForCurrentUser, workspacesLoading, workspaces, activeWorkspaceId]);

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
  }, [currentUser, activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }

    if (activeWorkspaceProjects.length === 0) {
      if (activeProjectId) {
        setActiveProjectId('');
      }
      return;
    }

    if (!activeWorkspaceProjects.some((project) => project.id === activeProjectId)) {
      const preferredProject = activeWorkspaceProjects.find((project) => project.id === activeWorkspace?.defaultProjectId) || activeWorkspaceProjects[0];
      if (preferredProject) {
        setActiveProjectId(preferredProject.id);
      }
    }
  }, [activeWorkspaceId, activeWorkspace?.defaultProjectId, activeWorkspaceProjects, activeProjectId, setActiveProjectId]);

  useEffect(() => {
    setProjectCreateError(null);
    setDomainCreateError(null);
  }, [activeWorkspaceId, activeProjectId]);

  useEffect(() => {
    const controller = registerWebMCPTools({
      createTicket,
      updateTicket,
      addComment,
      getTickets: () => tickets,
      getUsers: () => users,
      getProjects: () => projects,
    });

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [tickets, users, projects, createTicket, updateTicket, addComment]);

  const handleOpenCreateTicket = (initialStatus?: Ticket['status']) => {
    setCreateInitialStatus(initialStatus);
    setCreateParentId(undefined);
    setIsCreateModalOpen(true);
  };

  const handleOpenCreateSubtask = (parentId: string) => {
    setCreateParentId(parentId);
    setCreateInitialStatus(undefined);
    setIsCreateModalOpen(true);
  };

  const handleCreateTicketSubmit = async (ticket: {
    title: string;
    description: string;
    status: Ticket['status'];
    priority: Ticket['priority'];
    projectId: string;
    domainId: string | null;
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }) => {
    const created = await createTicket(ticket);
    return Boolean(created);
  };

  const handleDeleteTicket = async (ticketId: string) => {
    await deleteTicket(ticketId);
    setActiveTicket(null);
  };

  const handleCreateWorkspace = async (workspaceInput: {
    name: string;
    description: string;
    key: string;
    workspaceKey?: string;
    defaultProjectName?: string;
    defaultProjectKey?: string;
  }) => {
    const workspace = await createWorkspace(workspaceInput);
    if (!workspace || !currentUser) {
      return;
    }

    await fetchInitialData(currentUser.id);
    setActiveWorkspaceId(workspace.id);
    setActiveSection('workspace');
  };

  const handleRequestJoin = async (inviteCode: string, message?: string) => {
    await requestJoinByInvite(inviteCode, message);
    setActiveSection('directory');
  };

  const handleValidatePeerInvite = async (input: {
    email: string;
    validationCode: string;
    inviteUrl: string;
    username: string;
    passwordHash: string;
  }) => {
    const success = await validatePeerInvite(input);
    if (success) {
      setActiveWorkspaceId('');
      setActiveProjectId('');
      setActiveTicket(null);
      setActiveSection('directory');
    }
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId) || null;
    const workspaceProjects = projects.filter((project) => project.workspaceId === workspaceId);
    const currentWorkspaceProject = workspaceProjects.find((project) => project.id === activeProjectId) || null;
    const preferredProject = currentWorkspaceProject
      || workspaceProjects.find((project) => project.id === workspace?.defaultProjectId)
      || workspaceProjects[0]
      || null;

    setActiveWorkspaceId(workspaceId);
    if (preferredProject) {
      setActiveProjectId(preferredProject.id);
    } else {
      setActiveProjectId('');
    }
    setActiveTicket(null);
    setFilters({ assigneeId: '', domainId: '', cycleId: '' });
    setActiveSection('workspace');
  };

  const updateProjectSelection = (projectId: string, nextSection: 'workspace' | 'projects') => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project?.workspaceId) {
      setActiveWorkspaceId(project.workspaceId);
    }

    setActiveProjectId(projectId);
    setActiveTicket(null);
    setFilters({ assigneeId: '', domainId: '', cycleId: '' });
    setActiveSection(nextSection);
  };

  const handleSelectProject = (projectId: string) => {
    updateProjectSelection(projectId, 'workspace');
  };

  const handleSelectProjectForManagement = (projectId: string) => {
    updateProjectSelection(projectId, 'projects');
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
      setActiveSection('workspace');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project in this workspace.';
      setProjectCreateError(message);
      throw error;
    } finally {
      setProjectCreateLoading(false);
    }
  };

  const handleCreateDomain = async (domainInput: { name: string; color: string }) => {
    if (!activeProjectId) {
      return;
    }

    setDomainCreateLoading(true);
    setDomainCreateError(null);

    try {
      const domain = await createDomain({
        ...domainInput,
        projectId: activeProjectId,
      });

      if (!domain) {
        throw new Error('Failed to create domain for this project.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create domain for this project.';
      setDomainCreateError(message);
      throw error;
    } finally {
      setDomainCreateLoading(false);
    }
  };

  const handleShowProjectIssues = () => {
    if (!activeProjectId) {
      return;
    }

    setFilters({ projectId: activeProjectId, assigneeId: '', domainId: '', cycleId: '' });
    setActiveSection('workspace');
  };

  const handleShowMyIssues = () => {
    if (!activeProjectId || !currentUser) {
      return;
    }

    setFilters({ projectId: activeProjectId, assigneeId: currentUser.id, domainId: '', cycleId: '' });
    setActiveSection('workspace');
  };

  const handleSelectCycle = (cycleId: string) => {
    if (!activeProjectId) {
      return;
    }

    setFilters({ projectId: activeProjectId, cycleId, domainId: '', assigneeId: '' });
    setActiveSection('workspace');
  };

  const handleSelectDomain = (domainId: string) => {
    if (!activeProjectId) {
      return;
    }

    setFilters({ projectId: activeProjectId, domainId, cycleId: '', assigneeId: '' });
    setActiveSection('workspace');
  };

  const handleOpenSettings = () => {
    if (!activeWorkspace) {
      setActiveSection('directory');
      return;
    }

    setActiveTicket(null);
    setActiveSection('settings');
  };

  const handleOpenAccountPreferences = () => {
    setActiveTicket(null);
    setActiveSection('account');
  };

  const handleOpenProjectManager = () => {
    if (!activeWorkspace) {
      setActiveSection('directory');
      return;
    }

    setActiveTicket(null);
    setActiveSection('projects');
  };

  const handleCreateInvite = async (input: { email: string; expirationHours: number }) => Boolean(await createInvite(input));
  const handleRevokeInvite = async (inviteId: string) => Boolean(await revokeInvite(inviteId));
  const handleApproveJoinRequest = async (requestId: string) => Boolean(await approveJoinRequest(requestId));
  const handleRetryConnection = async (connectionId: string) => {
    await retryFederationConnection(connectionId);
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
  }, []);

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
    return <LoadingPage />;
  }

  if (currentUser && !workspaceReady) {
    return <LoadingPage />;
  }

  const onboarding = currentUser.tutorial_completed === 0 || currentUser.tutorial_completed === false ? (
    <OnboardingModal
      onComplete={() => {
        setCurrentUser({ ...currentUser, tutorial_completed: 1 });
      }}
    />
  ) : null;

  if (activeSection === 'account') {
    return (
      <>
        <AccountPreferencesPage
          currentUser={currentUser}
          settings={accountSettings}
          settingsLoading={accountSettingsLoading}
          saveLoading={accountSaveLoading}
          saveSuccess={accountSaveSuccess}
          saveError={accountSaveError}
          testing={accountTesting}
          testResult={accountTestResult}
          tutorialResult={accountTutorialResult}
          ollamaModels={ollamaModels}
          ollamaModelsLoading={ollamaModelsLoading}
          onBack={() => setActiveSection(activeWorkspace ? 'workspace' : 'directory')}
          onOpenDirectory={() => setActiveSection('directory')}
          onChangeSettings={updateAccountSettings}
          onRefreshOllamaModels={() => void refreshOllamaModels()}
          onResetTutorial={() => void resetTutorial()}
          onSaveSettings={() => void saveAccountSettings()}
          onTestApiKey={() => void testApiKey()}
        />
        {onboarding}
      </>
    );
  }

  if (activeSection === 'directory' || workspaces.length === 0) {
    return (
      <>
        <WorkspaceDirectoryPage
          currentUser={currentUser}
          workspaces={workspaces}
          loading={workspacesLoading}
          activeWorkspaceId={activeWorkspaceId}
          pendingAction={pendingAction}
          errorMessage={workspaceDirectoryError}
          successMessage={workspaceDirectorySuccess}
          onCreateWorkspace={handleCreateWorkspace}
          onRequestJoin={handleRequestJoin}
          onValidatePeerInvite={handleValidatePeerInvite}
          onOpenWorkspace={handleSelectWorkspace}
          onOpenSettings={(workspaceId) => {
            setActiveWorkspaceId(workspaceId);
            setActiveSection('settings');
          }}
          onOpenAccountPreferences={handleOpenAccountPreferences}
          onSignOut={signOut}
        />
        {onboarding}
      </>
    );
  }

  if (!activeWorkspace) {
    return <LoadingPage />;
  }

  const sidebarProps: SidebarProps = {
    workspace: {
      workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
      activeWorkspaceId,
      onSelectWorkspace: handleSelectWorkspace,
      onOpenWorkspaceDirectory: () => setActiveSection('directory'),
    },
    projects: {
      projects: activeWorkspaceProjects,
      domains,
      cycles,
      currentUser,
      activeProjectId,
      filters,
      counts: {
        myIssues: myIssuesCount,
        activeProjectIssues: openTickets.length,
        domains: domainCounts,
        cycles: cycleCounts,
      },
      onSelectProject: handleSelectProject,
      onShowProjectIssues: handleShowProjectIssues,
      onShowMyIssues: handleShowMyIssues,
      onSelectCycle: handleSelectCycle,
      onSelectDomain: handleSelectDomain,
    },
    tools: {
      onOpenOllama: () => setIsOllamaOpen((previous) => !previous),
      onOpenSimulator: () => setIsSimulatorOpen((previous) => !previous),
      onOpenCreateTicket: () => handleOpenCreateTicket(),
    },
    userMenu: {
      currentUser,
      activeArea: activeSection === 'projects' ? 'projects' : 'workspace',
      onOpenWorkspaceDirectory: () => setActiveSection('directory'),
      onOpenAccountPreferences: handleOpenAccountPreferences,
      onOpenProjectManager: handleOpenProjectManager,
      onOpenSettings: handleOpenSettings,
      onSignOut: signOut,
    },
  };

  return (
    <>
      {activeSection === 'settings' ? (
        <SettingsPage
          currentUser={currentUser}
          workspace={activeWorkspace}
          settings={settings}
          settingsLoading={settingsLoading}
          saveLoading={settingsSaveLoading}
          saveSuccess={settingsSaveSuccess}
          saveError={settingsSaveError}
          inviteError={workspaceInviteError}
          federationConnections={federationConnections}
          connectionsLoading={connectionsLoading}
          connectionsError={connectionsError}
          retryingConnectionId={retryingConnectionId}
          invitesLoading={workspaceInvitesLoading}
          inviteLoading={workspaceInviteLoading}
          invites={workspaceInvites}
          members={workspaceMembers}
          joinRequests={workspaceJoinRequests}
          approveLoadingId={approveLoadingId}
          revokeLoadingId={revokeLoadingId}
          onBackToWorkspace={() => setActiveSection('workspace')}
          onOpenDirectory={() => setActiveSection('directory')}
          onChangeSettings={updateSettings}
          onSaveSettings={saveSettings}
          onCreateInvite={handleCreateInvite}
          onRevokeInvite={handleRevokeInvite}
          onApproveJoinRequest={handleApproveJoinRequest}
          onRetryConnection={handleRetryConnection}
        />
      ) : (
        <WorkspaceLayout
          sidebarProps={sidebarProps}
          rightPanels={
            <>
              {isOllamaOpen ? (
                <LocalAIChat
                  onClose={() => setIsOllamaOpen(false)}
                  initialOllamaUrl={accountSettings.ollamaEndpoint}
                  initialModel={accountSettings.ollamaModel || ollamaModels[0] || ''}
                />
              ) : null}
              {isSimulatorOpen ? <AgentSimulator onClose={() => setIsSimulatorOpen(false)} /> : null}
            </>
          }
        >
          {activeSection === 'projects' ? (
            <WorkspaceProjectsPage
              workspaceName={activeWorkspace.name}
              projects={activeWorkspaceProjects}
              activeProjectId={activeProjectId}
              defaultProjectId={activeWorkspace.defaultProjectId}
              domains={domains}
              projectCreateLoading={projectCreateLoading}
              projectCreateError={projectCreateError}
              domainCreateLoading={domainCreateLoading}
              domainCreateError={domainCreateError}
              onBackToWorkspace={() => setActiveSection('workspace')}
              onCreateProject={handleCreateProject}
              onCreateDomain={handleCreateDomain}
              onSelectProject={handleSelectProjectForManagement}
            />
          ) : (
            <WorkspacePage
              activeTicket={activeTicket}
              activeView={activeView}
              comments={comments}
              currentUser={currentUser}
              cycles={cycles}
              domains={domains}
              filters={filters}
              listSort={listSort}
              projects={activeWorkspaceProjects}
              tickets={tickets}
              users={users}
              onAddComment={addComment}
              onDeleteTicket={handleDeleteTicket}
              onOpenCreateSubtask={handleOpenCreateSubtask}
              onOpenCreateTicket={handleOpenCreateTicket}
              onOpenProjectManager={handleOpenProjectManager}
              onSelectTicket={setActiveTicket}
              onSetFilters={setFilters}
              onSetListSort={setListSort}
              onSetView={setView}
              onUpdateTicket={updateTicket}
            />
          )}
        </WorkspaceLayout>
      )}

      {isCreateModalOpen ? (
        <CreateTicketModal
          onClose={() => setIsCreateModalOpen(false)}
          projects={activeWorkspaceProjects}
          domains={domains}
          cycles={cycles}
          users={users}
          parentTicket={parentTicket}
          defaultProjectId={activeProjectId || activeWorkspaceProjects[0]?.id || ''}
          onSubmitTicket={handleCreateTicketSubmit}
          initialStatus={createInitialStatus}
          parentId={createParentId}
        />
      ) : null}

      {onboarding}
    </>
  );
}
