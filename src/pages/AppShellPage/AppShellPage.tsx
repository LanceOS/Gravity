import { useEffect, useMemo, useState } from 'react';
import { AgentSimulator } from '../../components/AgentSimulator';
import { AuthScreen } from '../../components/AuthScreen';
import { CreateTicketModal } from '../../components/CreateTicketModal';
import { EmptyWorkspaceScreen } from '../../components/EmptyWorkspaceScreen';
import { LocalAIChat } from '../../components/LocalAIChat';
import { OnboardingModal } from '../../components/OnboardingModal';
import { useTickets, type Ticket } from '../../context/TicketContext';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout';
import { registerWebMCPTools } from '../../utils/webmcp';
import { LoadingPage } from '../LoadingPage/LoadingPage';
import { SettingsPage } from '../SettingsPage/SettingsPage';
import { WorkspacePage } from '../WorkspacePage/WorkspacePage';

type AppSection = 'workspace' | 'settings';

export function AppShellPage() {
  const {
    activeProjectId,
    activeTicket,
    activeView,
    addComment,
    comments,
    createProject,
    createTicket,
    currentUser,
    cycles,
    deleteTicket,
    domains,
    filters,
    loading,
    joinProject,
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
    toggleTheme,
    updateTicket,
    users,
  } = useTickets();

  const [activeSection, setActiveSection] = useState<AppSection>('workspace');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOllamaOpen, setIsOllamaOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<Ticket['status'] | undefined>(undefined);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<'create' | 'join' | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

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
    settings,
    settingsLoading,
    saveLoading: settingsSaveLoading,
    saveSuccess: settingsSaveSuccess,
    saveError: settingsSaveError,
    testing: settingsTesting,
    testResult: settingsTestResult,
    tutorialResult: settingsTutorialResult,
    ollamaModels,
    ollamaModelsLoading,
    updateSettings,
    saveSettings,
    testApiKey,
    resetTutorial,
    refreshOllamaModels,
  } = useWorkspaceSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme,
  });

  useEffect(() => {
    if (projects.length === 0) {
      setActiveSection('workspace');
    }
  }, [projects.length]);

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

  const handleCreateProject = async (project: { name: string; description: string; key: string }) => {
    setPendingWorkspaceAction('create');
    setWorkspaceError(null);

    try {
      await createProject(project);
    } catch (error: unknown) {
      setWorkspaceError(error instanceof Error ? error.message : 'Failed to create project.');
    } finally {
      setPendingWorkspaceAction(null);
    }
  };

  const handleJoinProject = async (inviteCode: string) => {
    setPendingWorkspaceAction('join');
    setWorkspaceError(null);

    try {
      await joinProject(inviteCode);
    } catch (error: unknown) {
      setWorkspaceError(error instanceof Error ? error.message : 'Failed to join project.');
    } finally {
      setPendingWorkspaceAction(null);
    }
  };

  const handleSelectProject = (projectId: string) => {
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
    setActiveTicket(null);
    setActiveSection('settings');
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

  if (loading) {
    return <LoadingPage />;
  }

  if (projects.length === 0) {
    return (
      <>
        <EmptyWorkspaceScreen
          currentUser={currentUser}
          pendingAction={pendingWorkspaceAction}
          errorMessage={workspaceError}
          onCreateProject={handleCreateProject}
          onJoinProject={handleJoinProject}
          onSignOut={signOut}
        />

        {currentUser.tutorial_completed === 0 || currentUser.tutorial_completed === false ? (
          <OnboardingModal
            onComplete={() => {
              setCurrentUser({ ...currentUser, tutorial_completed: 1 });
            }}
          />
        ) : null}
      </>
    );
  }

  const sidebarProps = {
    projects,
    domains,
    cycles,
    currentUser,
    activeProjectId,
    filters,
    theme,
    myIssuesCount,
    activeProjectTicketCount: openTickets.length,
    domainCounts,
    cycleCounts,
    activeArea: activeSection,
    onSelectProject: handleSelectProject,
    onShowProjectIssues: handleShowProjectIssues,
    onShowMyIssues: handleShowMyIssues,
    onSelectCycle: handleSelectCycle,
    onSelectDomain: handleSelectDomain,
    onToggleTheme: toggleTheme,
    onSignOut: signOut,
    onOpenOllama: () => setIsOllamaOpen((previous) => !previous),
    onOpenSimulator: () => setIsSimulatorOpen((previous) => !previous),
    onOpenCreateTicket: () => handleOpenCreateTicket(),
    onOpenSettings: handleOpenSettings,
  };

  return (
    <>
      <WorkspaceLayout
        sidebarProps={sidebarProps}
        rightPanels={
          <>
            {isOllamaOpen ? <LocalAIChat onClose={() => setIsOllamaOpen(false)} /> : null}
            {isSimulatorOpen ? <AgentSimulator onClose={() => setIsSimulatorOpen(false)} /> : null}
          </>
        }
      >
        {activeSection === 'settings' ? (
          <SettingsPage
            currentUser={currentUser}
            settings={settings}
            settingsLoading={settingsLoading}
            saveLoading={settingsSaveLoading}
            saveSuccess={settingsSaveSuccess}
            saveError={settingsSaveError}
            testing={settingsTesting}
            testResult={settingsTestResult}
            tutorialResult={settingsTutorialResult}
            ollamaModels={ollamaModels}
            ollamaModelsLoading={ollamaModelsLoading}
            onBackToWorkspace={() => setActiveSection('workspace')}
            onChangeSettings={updateSettings}
            onRefreshOllamaModels={refreshOllamaModels}
            onResetTutorial={resetTutorial}
            onSaveSettings={saveSettings}
            onTestApiKey={testApiKey}
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
            projects={projects}
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
        )}
      </WorkspaceLayout>

      {isCreateModalOpen ? (
        <CreateTicketModal
          onClose={() => setIsCreateModalOpen(false)}
          projects={projects}
          domains={domains}
          cycles={cycles}
          users={users}
          parentTicket={parentTicket}
          defaultProjectId={activeProjectId || projects[0]?.id || ''}
          onSubmitTicket={handleCreateTicketSubmit}
          initialStatus={createInitialStatus}
          parentId={createParentId}
        />
      ) : null}

      {currentUser.tutorial_completed === 0 || currentUser.tutorial_completed === false ? (
        <OnboardingModal
          onComplete={() => {
            setCurrentUser({ ...currentUser, tutorial_completed: 1 });
          }}
        />
      ) : null}
    </>
  );
}