import { useEffect, useMemo, useState } from 'react';
import { AgentSimulator } from '../../components/AgentSimulator';
import { AuthScreen } from '../../components/AuthScreen';
import { CreateTicketModal } from '../../components/CreateTicketModal';
import { LocalAIChat } from '../../components/LocalAIChat';
import { OnboardingModal } from '../../components/OnboardingModal';
import { useTickets, type Ticket } from '../../context/TicketContext';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout';
import { AccountPreferencesPage } from '../AccountPreferencesPage/AccountPreferencesPage';
import { registerWebMCPTools } from '../../utils/webmcp';
import { LoadingPage } from '../LoadingPage/LoadingPage';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { WorkspaceDirectoryPage } from '../WorkspaceDirectoryPage/WorkspaceDirectoryPage';
import { WorkspacePage } from '../WorkspacePage/WorkspacePage';

type AppSection = 'directory' | 'workspace' | 'settings' | 'account';

export function AppShellPage() {
  const {
    activeProjectId,
    activeTicket,
    activeView,
    addComment,
    comments,
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

  const [activeSection, setActiveSection] = useState<AppSection>('directory');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOllamaOpen, setIsOllamaOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<Ticket['status'] | undefined>(undefined);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);

  const {
    workspaces,
    loading: workspacesLoading,
    pendingAction,
    error: workspaceDirectoryError,
    successMessage: workspaceDirectorySuccess,
    createWorkspace,
    requestJoinByInvite,
  } = useWorkspaceDirectory({ currentUser });

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
    updateSettings,
    saveSettings,
    createInvite,
    approveJoinRequest,
  } = useWorkspaceSettings({
    currentUser,
    activeWorkspaceId,
  });

  useEffect(() => {
    if (!currentUser) {
      setActiveSection('directory');
      setActiveWorkspaceId('');
      return;
    }

    if (workspaces.length === 0) {
      setActiveSection('directory');
      setActiveWorkspaceId('');
      return;
    }

    if (!activeWorkspaceId || !workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, [currentUser, workspaces, activeWorkspaceId]);

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

  const handleSelectWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setActiveTicket(null);
    setFilters({ projectId: '', assigneeId: '', domainId: '', cycleId: '' });
    setActiveSection('workspace');
  };

  const handleSelectProject = (projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project?.workspaceId) {
      setActiveWorkspaceId(project.workspaceId);
    }

    setActiveProjectId(projectId);
    setActiveTicket(null);
    setFilters({ assigneeId: '', domainId: '', cycleId: '' });
    setActiveSection('workspace');
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

  const handleCreateInvite = async (label?: string) => Boolean(await createInvite(label));
  const handleApproveJoinRequest = async (requestId: string) => Boolean(await approveJoinRequest(requestId));

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

      if (event.key === 'c' || event.key === 'C') {
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

  if (loading || workspacesLoading) {
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

  if (activeSection === 'directory' || workspaces.length === 0 || !activeWorkspace) {
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

  const sidebarProps = {
    workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
    projects: activeWorkspaceProjects,
    domains,
    cycles,
    currentUser,
    activeWorkspaceId,
    activeProjectId,
    filters,
    myIssuesCount,
    activeProjectTicketCount: openTickets.length,
    domainCounts,
    cycleCounts,
    activeArea: activeSection === 'settings' ? 'settings' : activeSection === 'account' ? 'account' : 'workspace',
    onSelectWorkspace: handleSelectWorkspace,
    onOpenWorkspaceDirectory: () => setActiveSection('directory'),
    onSelectProject: handleSelectProject,
    onShowProjectIssues: handleShowProjectIssues,
    onShowMyIssues: handleShowMyIssues,
    onSelectCycle: handleSelectCycle,
    onSelectDomain: handleSelectDomain,
    onOpenAccountPreferences: handleOpenAccountPreferences,
    onSignOut: signOut,
    onOpenOllama: () => setIsOllamaOpen((previous) => !previous),
    onOpenSimulator: () => setIsSimulatorOpen((previous) => !previous),
    onOpenCreateTicket: () => handleOpenCreateTicket(),
    onOpenSettings: handleOpenSettings,
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
          invitesLoading={workspaceInvitesLoading}
          inviteLoading={workspaceInviteLoading}
          invites={workspaceInvites}
          members={workspaceMembers}
          joinRequests={workspaceJoinRequests}
          approveLoadingId={approveLoadingId}
          onBackToWorkspace={() => setActiveSection('workspace')}
          onOpenDirectory={() => setActiveSection('directory')}
          onChangeSettings={updateSettings}
          onSaveSettings={saveSettings}
          onCreateInvite={handleCreateInvite}
          onApproveJoinRequest={handleApproveJoinRequest}
        />
      ) : (
        <WorkspaceLayout
          sidebarProps={sidebarProps}
          rightPanels={
            <>
              {isOllamaOpen ? <LocalAIChat onClose={() => setIsOllamaOpen(false)} /> : null}
              {isSimulatorOpen ? <AgentSimulator onClose={() => setIsSimulatorOpen(false)} /> : null}
            </>
          }
        >
          <WorkspacePage
            activeTicket={activeTicket}
            activeView={activeView}
            comments={comments}
            currentUser={currentUser}
            cycles={cycles}
            domains={domains}
            filters={filters}
            projects={activeWorkspaceProjects}
            tickets={tickets}
            users={users}
            onAddComment={addComment}
            onDeleteTicket={handleDeleteTicket}
            onOpenCreateSubtask={handleOpenCreateSubtask}
            onOpenCreateTicket={handleOpenCreateTicket}
            onSelectTicket={setActiveTicket}
            onSetFilters={setFilters}
            onSetView={setView}
            onUpdateTicket={updateTicket}
          />
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
