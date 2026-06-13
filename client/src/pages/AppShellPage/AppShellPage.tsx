import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import type { SidebarTree, Cycle, Label } from '../../types/domain';

import { AuthScreen } from '../../modules/auth';
import { CreateTicketModal } from '../../modules/tickets';
import { LocalAIChat } from '../../modules/ai';
import { OnboardingModal } from '../../modules/onboarding';
import { ProjectCreateOverlay } from '../../modules/workspaces/components/ProjectCreateOverlay';
import { LabelCreateOverlay } from '../../modules/tickets/components/LabelCreateOverlay';
import type { SidebarNavigationState, SidebarProps } from '../../components/Sidebar';
import { useTickets, type Ticket } from '../../context/TicketContext';
import { useTheme, SettingsScreen as SettingsPage } from '../../modules/settings';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { WorkspaceLayout } from '../../layouts/WorkspaceLayout/WorkspaceLayout';
import { AccountPreferencesPage } from '../AccountPreferencesPage/AccountPreferencesPage';
import type { TicketListSort } from '../../modules/tickets/utils/ticketView';
import { registerWebMCPTools } from '../../utils/webmcp';
import { LoadingPage } from '../LoadingPage/LoadingPage';
import { WorkspaceDirectoryPage } from '../WorkspaceDirectoryPage/WorkspaceDirectoryPage';
import { WorkspacePage, type WorkspaceIssueView } from '../WorkspacePage/WorkspacePage';
import { WorkspaceProjectsPage } from '../WorkspaceProjectsPage/WorkspaceProjectsPage';
import { WorkspaceProjectsListPage } from '../WorkspaceProjectsListPage/WorkspaceProjectsListPage';
import { WorkspaceTeamProjectsPage } from '../WorkspaceTeamProjectsPage/WorkspaceTeamProjectsPage';
import { WorkspaceTeamsPage } from '../WorkspaceTeamsPage/WorkspaceTeamsPage';
import { TicketDetailRoute } from '../../modules/tickets/components/TicketDetailRoute';
import { WorkspaceMcpModal } from '../../modules/workspaces/components/WorkspaceMcpModal';
import './AppShellPage.css';

type AppSection = 'directory' | 'workspace' | 'settings' | 'account' | 'projects' | 'teams' | 'team-projects';

function getActiveWorkspaceStorageKey(userId: string) {
  return `gravity_active_workspace:${userId}`;
}

export function AppShellPage() {
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
    updateProject,
    users,
  } = useTickets();

  const [activeSection, setActiveSection] = useState<AppSection>('workspace');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [activeContext, setActiveContext] = useState<'issues' | 'notes'>('issues');
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isCreateLabelModalOpen, setIsCreateLabelModalOpen] = useState(false);
  const [isOllamaOpen, setIsOllamaOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isOllamaClosing, setIsOllamaClosing] = useState(false);
  const [sidebarActiveScope, setSidebarActiveScope] = useState<SidebarNavigationState['activeScope']>('workspace');
  const [ollamaCloseTimer, setOllamaCloseTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (ollamaCloseTimer) {
        clearTimeout(ollamaCloseTimer);
      }
    };
  }, [ollamaCloseTimer]);

  const handleToggleOllama = () => {
    if (isOllamaClosing) {
      return;
    }

    if (isOllamaOpen) {
      setIsOllamaClosing(true);

      if (ollamaCloseTimer) {
        clearTimeout(ollamaCloseTimer);
      }

      const timer = setTimeout(() => {
        setIsOllamaOpen(false);
        setIsOllamaClosing(false);
        setOllamaCloseTimer(null);
      }, 300); // Matches AIChatWindow animation duration (0.3s)

      setOllamaCloseTimer(timer);
      return;
    }

    setIsOllamaOpen(true);
  };

  const [createInitialStatus, setCreateInitialStatus] = useState<Ticket['status'] | undefined>(undefined);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [listSort, setListSort] = useState<TicketListSort>('created');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile && activeView !== 'list') {
        setView('list');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeView, setView]);
  const [projectCreateLoading, setProjectCreateLoading] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [labelCreateLoading, setLabelCreateLoading] = useState(false);
  const [labelCreateError, setLabelCreateError] = useState<string | null>(null);

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
  const {
    settings: accountSettings,
    settingsLoading: accountSettingsLoading,
    saveLoading: accountSaveLoading,
    saveSuccess: accountSaveSuccess,
    saveError: accountSaveError,
    testing: accountTesting,
    testResult: accountTestResult,
    savedCredentials: accountSavedCredentials,
    tutorialResult: accountTutorialResult,
    ollamaModels,
    ollamaModelsLoading,
    updateSettings: updateAccountSettings,
    saveSettings: saveAccountSettings,
    removeCredential: removeCredential,
    resetProviderDraft,
    testApiKey,
    resetTutorial,
    refreshOllamaModels,
    hasProviderChanges: accountHasProviderChanges,
    hasChanges: accountHasChanges,
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
  }, [accountSettings?.projectLayout, accountSettings?.theme, setDensity, setDsTheme]);

  const {
    workspaceId,
    projectId: projectIdParam,
    teamId: teamIdParam,
    viewId: viewIdParam,
    cycleId: cycleIdParam,
    labelId: labelIdParam,
    domainId: legacyDomainIdParam,
    ticketKey,
    noteId,
  } = useParams();
  const activeLabelIdParam = labelIdParam || legacyDomainIdParam;
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isWorkspaceAllTasksPath = !!workspaceId && (
    pathname === `/workspaces/${workspaceId}/all` ||
    pathname === `/workspaces/${workspaceId}/all/`
  );
  const isWorkspaceProjectsListPath = !!workspaceId && (
    pathname === `/workspaces/${workspaceId}/projects/list` ||
    pathname === `/workspaces/${workspaceId}/projects/list/`
  );
  const isTeamAggregatePath = !!teamIdParam && !projectIdParam;
  const shouldUseAggregateTicketScope = isWorkspaceAllTasksPath || isTeamAggregatePath;
  const shouldKeepActiveProjectSelection = isWorkspaceAllTasksPath || isWorkspaceProjectsListPath || isTeamAggregatePath;

  // Teams-specific queries
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
    queryKey: ['teamTickets', teamIdParam],
    queryFn: () => apiClient.get<Ticket[]>('/tickets', { params: { teamId: teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
  });

  const { data: teamCycles = [] } = useQuery<Cycle[]>({
    queryKey: ['teamCycles', teamIdParam],
    queryFn: () => apiClient.get<Cycle[]>('/cycles', { params: { teamId: teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
  });

  const { data: teamLabels = [] } = useQuery<Label[]>({
    queryKey: ['teamLabels', teamIdParam],
    queryFn: () => apiClient.get<Label[]>('/labels', { params: { teamId: teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
  });

  const handleSelectTeam = useCallback((teamId: string) => {
    navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/tasks`);
  }, [activeWorkspaceId, navigate]);

  const handleSelectWorkspaceAllTasks = useCallback(() => {
    setSidebarActiveScope('workspace');
    navigate(`/workspaces/${activeWorkspaceId}/all`);
  }, [activeWorkspaceId, navigate, setSidebarActiveScope]);

  const handleSelectWorkspaceProjects = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }

    setActiveTicket(null);
    setActiveNoteId('');
    setActiveSection('workspace');
    setSidebarActiveScope('workspace-projects');
    navigate(`/workspaces/${activeWorkspaceId}/projects/list`);
  }, [activeWorkspaceId, navigate, setActiveNoteId, setActiveSection, setActiveTicket, setSidebarActiveScope]);

  const handleSelectView = useCallback((teamId: string, viewId: string) => {
    if (viewId === 'all') {
      navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/tasks`);
      return;
    }

    navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/views/${viewId}`);
  }, [activeWorkspaceId, navigate]);

  const handleSelectCycle = useCallback((teamId: string, cycleId: string) => {
    navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/cycles/${cycleId}`);
  }, [activeWorkspaceId, navigate]);

  const handleSelectTeamLabel = useCallback((teamId: string, labelId: string) => {
    navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/labels/${labelId}`);
  }, [activeWorkspaceId, navigate]);

  const handleSelectAllTasks = useCallback((teamId: string) => {
    navigate(`/workspaces/${activeWorkspaceId}/teams/${teamId}/tasks`);
  }, [activeWorkspaceId, navigate]);

  // Track last-applied URL filter values to avoid calling setFilters in a loop
  const lastSyncedFilterParams = useRef({
    labels: [] as string[],
    labelMode: 'any' as 'all' | 'any',
    cycleId: '',
    labelId: '',
    assigneeId: '',
    status: '',
    priority: '',
    search: '',
  });

  // URL-driven section, workspace, project, ticket, and filter syncing
  useEffect(() => {
    if (pathname === '/workspaces' || pathname === '/workspaces/') {
      setActiveSection('directory');
      setActiveTicket(null);
      setActiveNoteId('');
      setSidebarActiveScope('workspace');
      return;
    }

    if (pathname === '/account' || pathname === '/account/') {
      setActiveSection('account');
      setActiveNoteId('');
      setSidebarActiveScope('workspace');
      return;
    }

    if (!workspaceId) return;

    setActiveWorkspaceId(workspaceId);

    const isSettingsPath = pathname.includes('/settings');
    const isProjectsManagementPath =
      pathname === `/workspaces/${workspaceId}/projects` ||
      pathname === `/workspaces/${workspaceId}/projects/`;
    const isTeamsManagementPath =
      pathname === `/workspaces/${workspaceId}/teams` ||
      pathname === `/workspaces/${workspaceId}/teams/`;
    const isTeamProjectsManagementPath = !!teamIdParam && (
      pathname === `/workspaces/${workspaceId}/teams/${teamIdParam}/projects` ||
      pathname === `/workspaces/${workspaceId}/teams/${teamIdParam}/projects/`
    );
    const isNotesPath = pathname.includes('/notes');
    const isTicketsPath = pathname.includes('/tickets');

    if (isSettingsPath) {
      setActiveSection('settings');
      setActiveTicket(null);
      setActiveNoteId('');
      setSidebarActiveScope('workspace');
      return;
    }

    if (isProjectsManagementPath) {
      setActiveSection('projects');
      setActiveTicket(null);
      setActiveNoteId('');
      setSidebarActiveScope('projects');
      return;
    }

    if (isTeamsManagementPath) {
      setActiveSection('teams');
      setActiveTicket(null);
      setActiveNoteId('');
      setSidebarActiveScope('workspace');
      return;
    }

    if (isTeamProjectsManagementPath) {
      setActiveSection('team-projects');
      setActiveTicket(null);
      setActiveNoteId('');
      setSidebarActiveScope('projects');
      return;
    }

    // Workspace-level views (project routes, notes, tickets)
    setActiveSection('workspace');

    const nextSidebarScope: SidebarNavigationState['activeScope'] = teamIdParam
      ? (projectIdParam
        ? 'projects'
        : cycleIdParam
          ? 'cycles'
          : activeLabelIdParam
            ? 'labels'
            : 'views')
      : (projectIdParam ? 'projects' : 'workspace');

    // Sync project from URL param when on a project-specific path
    if (projectIdParam) {
      setActiveProjectId(projectIdParam);
    } else if (!shouldKeepActiveProjectSelection) {
      setActiveProjectId('');
    }

    setSidebarActiveScope(
      isWorkspaceAllTasksPath
        ? 'workspace'
        : isWorkspaceProjectsListPath
          ? 'workspace-projects'
          : nextSidebarScope
    );

    // Sync notes context
    if (isNotesPath) {
      setActiveContext('notes');
      setActiveNoteId(noteId ?? '');
    } else if (isTicketsPath || !isNotesPath) {
      setActiveContext('issues');
      setActiveNoteId('');
    }

    // Sync filters from URL search params — only call setFilters when URL params changed
    const searchLabelsStr = searchParams.get('labels') ?? '';
    const searchLabels = searchLabelsStr.split(',').filter(Boolean);
    const urlLabelMode = (searchParams.get('labelMode') as 'all' | 'any') ?? 'any';
    const urlCycleId = cycleIdParam || (searchParams.get('cycleId') ?? '');
    const urlLabelId = activeLabelIdParam || (searchParams.get('labelId') ?? searchParams.get('domainId') ?? '');
    const urlAssigneeId = searchParams.get('assigneeId') ?? '';
    const urlStatus = searchParams.get('status') ?? '';
    const urlPriority = searchParams.get('priority') ?? '';
    const urlSearch = searchParams.get('q') ?? '';
    const urlLabels = urlLabelId ? [urlLabelId] : searchLabels;

    const last = lastSyncedFilterParams.current;
    const labelsChanged = JSON.stringify(last.labels) !== JSON.stringify(urlLabels);
    if (
      labelsChanged ||
      last.labelMode !== urlLabelMode ||
      last.cycleId !== urlCycleId ||
      last.labelId !== urlLabelId ||
      last.assigneeId !== urlAssigneeId ||
      last.status !== urlStatus ||
      last.priority !== urlPriority ||
      last.search !== urlSearch
    ) {
      lastSyncedFilterParams.current = {
        labels: urlLabels,
        labelMode: urlLabelMode,
        cycleId: urlCycleId,
        labelId: urlLabelId,
        assigneeId: urlAssigneeId,
        status: urlStatus,
        priority: urlPriority,
        search: urlSearch
      };
      setFilters({
        labels: urlLabels,
        labelMode: urlLabelMode,
        cycleId: urlCycleId,
        labelId: urlLabelId,
        assigneeId: urlAssigneeId,
        status: urlStatus,
        priority: urlPriority,
        search: urlSearch
      });
    }

    // Close ticket detail if URL no longer contains a ticketKey
    if (!ticketKey) {
      setActiveTicket(null);
    }
  }, [
    pathname,
    workspaceId,
    projectIdParam,
    teamIdParam,
    cycleIdParam,
    activeLabelIdParam,
    ticketKey,
    noteId,
    searchParams,
    isWorkspaceAllTasksPath,
    isWorkspaceProjectsListPath,
    isTeamAggregatePath,
    shouldUseAggregateTicketScope,
    shouldKeepActiveProjectSelection,
  ]);

  // Resolve ticketKey URL param → Ticket object once tickets have loaded
  useEffect(() => {
    if (!ticketKey) return;
    // Only update if the active ticket doesn't already match the URL key
    if (activeTicket?.key === ticketKey) return;
    const resolved = tickets.find((t) => t.key === ticketKey) ?? null;
    setActiveTicket(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketKey, tickets]);

  // Root path routing redirect
  useEffect(() => {
    if (pathname === '/' && workspaceReady) {
      if (activeWorkspaceId) {
        navigate(`/workspaces/${activeWorkspaceId}`, { replace: true });
      } else if (workspaces.length === 0) {
        navigate('/workspaces', { replace: true });
      }
    }
  }, [pathname, activeWorkspaceId, workspaceReady, workspaces, navigate]);

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

  // Invite query parameter listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const invite = urlParams.get('invite');
    if (invite) {
      window.localStorage.setItem('gravity_pending_invite', invite);
      // Clean up the URL
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // Handle pending invite auto-join
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser) return;

    const pendingInvite = window.localStorage.getItem('gravity_pending_invite');
    if (pendingInvite) {
      window.localStorage.removeItem('gravity_pending_invite');

      const runAutoJoin = async () => {
        const success = await requestJoinByInvite(pendingInvite);
        if (success) {
          await refreshWorkspaces();
        }
      };
      void runAutoJoin();
    }
  }, [currentUser, requestJoinByInvite, refreshWorkspaces]);

  useEffect(() => {
    if (!activeWorkspaceId || !currentUser) {
      return;
    }

    // Record user activity in the selected workspace
    fetch(`/api/v1/workspaces/${activeWorkspaceId}/members/${currentUser.id}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': currentUser.id,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.lastActiveAt) {
          updateMemberActivity(currentUser.id, data.lastActiveAt);
        }
      })
      .catch((err) => {
        console.error('Failed to log workspace activity:', err);
      });
  }, [activeWorkspaceId, currentUser, updateMemberActivity]);

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
  }, [
    activeWorkspaceId,
    activeWorkspace?.defaultProjectId,
    activeWorkspaceProjects,
    activeProjectId,
    setActiveProjectId,
  ]);

  useEffect(() => {
    setProjectCreateError(null);
    setLabelCreateError(null);
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
    if (activeWorkspaceProjects.length === 0) {
      return;
    }

    setCreateInitialStatus(initialStatus);
    setCreateParentId(undefined);
    setIsCreateModalOpen(true);
  };

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

  const handleCreateWorkspace = async (workspaceInput: {
    name: string;
    description: string;
    key: string;
    workspaceKey?: string;
  }) => {
    const workspace = await createWorkspace(workspaceInput);
    if (!workspace || !currentUser) {
      return;
    }

    await fetchInitialData(currentUser.id);
    navigate(`/workspaces/${workspace.id}`);
  };

  const handleRequestJoin = async (inviteCode: string, message?: string) => {
    await requestJoinByInvite(inviteCode, message);
    navigate('/workspaces');
  };



  const handleSelectWorkspace = (workspaceId: string) => {
    setActiveTicket(null);
    setFilters({ assigneeId: '', labels: [], cycleId: '', labelId: '' });
    navigate(`/workspaces/${workspaceId}`);
  };

  const buildProjectScopedPath = useCallback((
    projectId: string,
    scope: 'tickets' | 'notes' = 'tickets',
    itemId?: string,
  ) => {
    const project = projects.find((item) => item.id === projectId);
    const projectWorkspaceId = project?.workspaceId || activeWorkspaceId;
    const projectTeamId = project?.teamId || teamIdParam;
    const basePath = (sidebarTree?.hierarchyMode === 'teams' || !!teamIdParam) && projectTeamId
      ? `/workspaces/${projectWorkspaceId}/teams/${projectTeamId}/projects/${projectId}/${scope}`
      : `/workspaces/${projectWorkspaceId}/projects/${projectId}/${scope}`;

    return itemId ? `${basePath}/${itemId}` : basePath;
  }, [activeWorkspaceId, projects, sidebarTree?.hierarchyMode, teamIdParam]);

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

  const handleSetFilters = useCallback((updates: Partial<typeof filters>) => {
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
  }, [filters, searchParams, setSearchParams]);

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
  }, [deleteWorkspace, refreshWorkspaces, navigate]);

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
  }, [activeWorkspaceProjects.length]);

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
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
          hasChanges={accountHasChanges}
          hasProviderChanges={accountHasProviderChanges}
          saveError={accountSaveError}
          testing={accountTesting}
          testResult={accountTestResult}
          savedCredentials={accountSavedCredentials}
          tutorialResult={accountTutorialResult}
          ollamaModels={ollamaModels}
          ollamaModelsLoading={ollamaModelsLoading}
          onBack={() => navigate(activeWorkspace ? `/workspaces/${activeWorkspaceId}` : '/workspaces')}
          onOpenDirectory={() => navigate('/workspaces')}
          onChangeSettings={updateAccountSettings}
          onResetProviderDraft={resetProviderDraft}
          onRefreshOllamaModels={refreshOllamaModels}
          onResetTutorial={resetTutorial}
          onSaveSettings={saveAccountSettings}
          onTestApiKey={testApiKey}
          onRemoveCredential={removeCredential}
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
          onOpenWorkspace={handleSelectWorkspace}
          onOpenSettings={(wsId) => {
            navigate(`/workspaces/${wsId}/settings`);
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

  const activeProject = projects.find((project) => project.id === (projectIdParam || activeProjectId));
  const activeProjectTeamId =
    activeProject?.teamId ||
    sidebarTree?.teams?.find((team) => team.projects?.some((project) => project.id === (projectIdParam || activeProjectId)))?.id ||
    '';
  const sidebarActiveTeamId = teamIdParam || activeProjectTeamId;
  const handleOpenCurrentTeamProjectsManager = () => {
    if (sidebarActiveTeamId) {
      handleOpenTeamProjectsManager(sidebarActiveTeamId);
      return;
    }

    handleOpenTeamManager();
  };
  const isTeamProjectsManager = activeSection === 'team-projects';
  const sidebarNavigationState: SidebarNavigationState = {
    activeTeam: sidebarActiveTeamId,
    activeScope: sidebarActiveScope,
    activeProject: sidebarActiveScope === 'projects' && !isTeamProjectsManager ? (projectIdParam || activeProjectId) : '',
  };
  const sidebarActiveViewId = teamIdParam && sidebarActiveScope === 'views'
    ? (viewIdParam || 'all')
    : '';
  const activeTeam = sidebarTree?.teams?.find((team) => team.id === sidebarActiveTeamId);
  const activeTeamProjectIds = new Set(activeTeam?.projects?.map((project) => project.id) ?? []);
  const teamProjectsForManager = teamIdParam
    ? activeWorkspaceProjects.filter((project) => project.teamId === teamIdParam || activeTeamProjectIds.has(project.id))
    : [];
  const isTimelineAggregatePath = isTeamAggregatePath && viewIdParam === 'timeline';
  const effectiveActiveView: WorkspaceIssueView = isTimelineAggregatePath
    ? 'timeline'
    : activeView;
  const lockWorkspaceIssueView = isTimelineAggregatePath;
  const scopedProjects = teamIdParam
    ? activeWorkspaceProjects.filter((project) => project.teamId === teamIdParam || activeTeamProjectIds.has(project.id))
    : activeWorkspaceProjects;
  const scopedTickets = isWorkspaceAllTasksPath
    ? workspaceTickets
    : isTeamAggregatePath
      ? teamTickets
      : tickets;
  const scopedCycles = isTeamAggregatePath ? teamCycles : cycles;
  const scopedLabels = isTeamAggregatePath ? teamLabels : labels;
  const scopedFilters = shouldUseAggregateTicketScope ? { ...filters, projectId: '' } : filters;
  const createDefaultProjectId =
    activeProjectId ||
    scopedProjects[0]?.id ||
    activeWorkspaceProjects[0]?.id ||
    '';
  const isTeamWorkspace = (sidebarTree?.hierarchyMode ?? activeWorkspace.hierarchyMode) === 'teams';
  const isTeamsManager = activeSection === 'teams' || (isTeamWorkspace && activeSection === 'projects');
  const isWorkspaceOwner = activeWorkspace.memberRole === 'owner';

  const sidebarProps: SidebarProps = {
    workspace: {
      workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
      activeWorkspaceId,
      onSelectWorkspace: handleSelectWorkspace,
      onOpenWorkspaceDirectory: () => navigate('/workspaces'),
    },
    projects: {
      hierarchyMode: sidebarTree?.hierarchyMode,
      teams: sidebarTree?.teams,
      navigationState: sidebarNavigationState,
      activeViewId: sidebarActiveViewId,
      activeTeamId: sidebarActiveTeamId,
      activeCycleId: cycleIdParam,
      activeLabelId: activeLabelIdParam,
      onSelectWorkspaceAllTasks: handleSelectWorkspaceAllTasks,
      onSelectWorkspaceProjects: handleSelectWorkspaceProjects,
      onSelectTeam: handleSelectTeam,
      onSelectView: handleSelectView,
      onSelectCycle: handleSelectCycle,
      onSelectTeamLabel: handleSelectTeamLabel,
      onSelectAllTasks: handleSelectAllTasks,

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
    },
    tools: {
      onOpenOllama: handleToggleOllama,
      isOllamaOpen,
      onOpenSimulator: () => { },
      onOpenCreateTicket: () => handleOpenCreateTicket(),
      agentIntegration: accountSettings.agentIntegration,
      aiProvider: accountSettings.aiProvider,
    },
    userMenu: {
      currentUser,
      activeArea: isTeamsManager || isTeamProjectsManager ? 'teams' : activeSection === 'projects' ? 'projects' : 'workspace',
      showWorkspaceManagement: !isTeamWorkspace || isWorkspaceOwner,
      workspaceManagementLabel: isTeamWorkspace ? 'Manage Teams' : 'Manage Projects',
      workspaceManagementArea: isTeamWorkspace ? 'teams' : 'projects',
      onOpenWorkspaceDirectory: () => navigate('/workspaces'),
      onOpenAccountPreferences: handleOpenAccountPreferences,
      onOpenProjectManager: isTeamWorkspace ? handleOpenTeamManager : handleOpenProjectManager,
      onOpenSettings: handleOpenSettings,
      onOpenMcp: () => setIsMcpOpen(true),
      onSignOut: signOut,
    },
  };

  const resolvedTicketForRoute = ticketKey ? tickets.find((t) => t.key === ticketKey) || null : activeTicket;

  const ticketDetailComponent = ticketKey ? (
    <TicketDetailRoute
      activeWorkspaceId={activeWorkspaceId}
      activeTicket={resolvedTicketForRoute}
      comments={comments}
      tickets={tickets}
      users={users}
      projects={activeWorkspaceProjects}
      labels={labels}
      cycles={cycles}
      onSelectTicket={(ticket) => {
        if (ticket) {
          navigate(buildProjectScopedPath(ticket.projectId, 'tickets', ticket.key));
        }
      }}
      onUpdateTicket={updateTicket}
      onDeleteTicket={handleDeleteTicket}
      onAddComment={addComment}
      onUpdateComment={updateComment}
      onDeleteComment={deleteComment}
      onOpenCreateSubtask={handleOpenCreateSubtask}
    />
  ) : null;

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
      ) : (
        <WorkspaceLayout
          sidebarProps={sidebarProps}
          isMobile={isMobile}
          rightPanels={
            <>
              {isOllamaOpen || isOllamaClosing ? (
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
              ) : null}
            </>
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
              onCreateProject={createProject}
              onUpdateProject={updateProject}
              onDeleteProject={deleteProject}
            />
          ) : activeSection === 'projects' ? (
            <WorkspaceProjectsPage
              workspaceName={activeWorkspace.name}
              projects={activeWorkspaceProjects}
              activeProjectId={activeProjectId}
              defaultProjectId={activeWorkspace.defaultProjectId}
              labels={labels}
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
          ) : ticketKey ? (
            ticketDetailComponent
          ) : (
            <WorkspacePage
              workspaceId={activeWorkspaceId}
              workspaceName={activeWorkspace?.name}
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
      )}

      {isCreateModalOpen ? (
        <CreateTicketModal
          onClose={() => setIsCreateModalOpen(false)}
          projects={activeWorkspaceProjects}
          labels={scopedLabels}
          cycles={scopedCycles}
          users={users}
          parentTicket={parentTicket}
          defaultProjectId={createDefaultProjectId}
          onSubmitTicket={handleCreateTicketSubmit}
          initialStatus={createInitialStatus}
          parentId={createParentId}
        />
      ) : null}

      {onboarding}
      {isMcpOpen ? (
        <WorkspaceMcpModal workspaceId={activeWorkspaceId} isOpen={isMcpOpen} onClose={() => setIsMcpOpen(false)} />
      ) : null}

      {isCreateProjectModalOpen ? (
        <ProjectCreateOverlay
          loading={projectCreateLoading}
          errorMessage={projectCreateError}
          onClose={() => setIsCreateProjectModalOpen(false)}
          onSubmitProject={async (p) => {
            await createProject(p);
            setIsCreateProjectModalOpen(false);
          }}
        />
      ) : null}

      {isCreateLabelModalOpen ? (
        <LabelCreateOverlay
          loading={labelCreateLoading}
          errorMessage={labelCreateError}
          onClose={() => setIsCreateLabelModalOpen(false)}
          onSubmitLabel={async (l) => {
            await createLabel({ ...l, projectId: activeProjectId });
            setIsCreateLabelModalOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
