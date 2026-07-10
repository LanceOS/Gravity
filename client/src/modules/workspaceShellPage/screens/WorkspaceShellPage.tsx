import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useIsFetching, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import type { SidebarNavigationState, SidebarProps } from '../../../components/Sidebar';
import { WorkspaceLayout } from '../../../layouts/WorkspaceLayout/WorkspaceLayout';
import { AiChatDock } from '../../aiChat';
import { Button } from '@library';
import { AuthScreen } from '../../auth';
import type { TicketFilters, TicketListSort } from '../../tickets';
import type { WorkspaceIssueView } from '../../workspacePage/screens/WorkspacePage';
import { OnboardingModal } from '../../onboarding';
import { useTheme } from '../../settings';
import type { Ticket } from '../../../context/TicketContextContext';
import { useAuth } from '../../../context/auth/AuthContext';
import { useActiveProject } from '../../../context/project/ActiveProjectContext';
import { useProjectContext } from '../../../context/project/ProjectContext';
import { useLabels } from '../../../context/label/LabelContext';
import { WorkspaceTicketActionProviders } from '../../../context/TicketContext';
import { useTicketListContext } from '../../../context/ticket/TicketListContext';
import { useUserDirectory } from '../../../context/user/UserDirectoryContext';
import { useCycles } from '../../../context/cycle/CycleContext';
import { useTicketFilters } from '../../../context/filters/TicketFiltersContext';
import { useActiveView } from '../../../context/ui/ActiveViewContext';
import { apiClient } from '../../../utils/apiClient';
import type { Cycle, Label, SidebarTree } from '../../../types/domain';
import { WorkspaceProjectsListPage } from '../../workspaceProjectsListPage';
import { WorkspaceTeamsPage } from '../../workspaceTeamsPage';
import { useAccountSettings } from '../../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../../hooks/useWorkspaceDirectory';
import { AppShellOverlays } from '../components/AppShellOverlays';
import { WorkspaceIssueSurface } from '../components/WorkspaceIssueSurface';
import { WorkspaceWebMcpRegistration } from '../components/WorkspaceWebMcpRegistration';
import { useAppShellRoute } from '../hooks/useAppShellRoute';
import { useAppShellRouteSync } from '../hooks/useAppShellRouteSync';
import { supportsWebMcpRegistration } from '../hooks/useWebMcpRegistration';
import {
  usePendingWorkspaceInvite,
  useWorkspaceMemberActivity,
  useWorkspaceProjectSelection,
} from '../hooks/useWorkspaceLifecycle';
import { useAgentPanel } from '../hooks/useAgentPanel';
import { useWorkspaceViewMode } from '../hooks/useWorkspaceViewMode';
import type { AppSection } from '../types/AppShell';
import { LoadingPage } from '../../loadingPage';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import { patchTutorialCompleted } from '../../../utils/tutorialApi';
import { ChatHistoryHeaderRow, ChatHistoryMenuButton, getChatSession, toChatMessages, useChatSessionsList } from '../../chats';
import type { Message } from '../../ai';
import {
  useWorkspaceCreateLabelDialog,
  useWorkspaceCreateProjectDialog,
  useWorkspaceCreateTicketDialog,
  useWorkspaceManagementCommands,
  useWorkspaceShellFilters,
  useWorkspaceShellNavigation,
  useWorkspaceSidebarCounts,
  WorkspaceProjectPanel,
  WorkspaceTeamProjectsPanel,
} from '../../workspaces';
import { createWorkspaceProjectCounts } from '../../workspaces/utils/workspaceProjectCounts';
import '../../workspaceProjectsPanel/styles/WorkspaceProjectsPage.css';
import '../../workspacePage/styles/WorkspacePage.css';
import { WorkspacePageLayout } from '../../../layouts/WorkspacePageLayout/WorkspacePageLayout';
interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  createdAt: string;
  lastActiveAt?: string | null;
}

const AGGREGATE_TICKETS_PAGE_SIZE = 120;

export function WorkspaceShellPage() {
  const { currentUser, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { users, isLoading: usersLoading } = useUserDirectory();
  const {
    tickets,
    activeTicket,
    setActiveTicket,
    ticketsByParentId,
  } = useTicketListContext();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  const {
    projects,
    projectById,
    projectsByWorkspaceId,
    projectsLoading,
    createProject,
    fetchProjectData,
    deleteProject,
    updateProject,
  } = useProjectContext();
  const { labels, createLabel, updateLabel, deleteLabel } = useLabels();
  const { cycles } = useCycles();
  const { filters, setFilters } = useTicketFilters();
  const { activeView, setView } = useActiveView();
  const loading = authLoading || projectsLoading || usersLoading;
  const route = useAppShellRoute(currentUser?.id);
  const [activeSection, setActiveSection] = useState<AppSection>('workspace');
  const [localTutorialCompleted, setLocalTutorialCompleted] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => route.workspaceId || '');
  const [activeContext, setActiveContext] = useState<'issues' | 'notes'>('issues');
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isCreateLabelModalOpen, setIsCreateLabelModalOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [sidebarActiveScope, setSidebarActiveScope] = useState<SidebarNavigationState['activeScope']>('workspace');
  const { isAgentOpen, isAgentClosing, handleOpenAgent, handleToggleAgent } = useAgentPanel();
  const [seedAiChatSessionId, setSeedAiChatSessionId] = useState('');
  const [liveAiChatSessionId, setLiveAiChatSessionId] = useState('');
  const [seedAiChatMessages, setSeedAiChatMessages] = useState<Message[] | undefined>(undefined);
  const [activeAiChatSessionProjectId, setActiveAiChatSessionProjectId] = useState('');
  const aiChatHistoryRequestIdRef = useRef(0);
  const latestAiChatProjectIdRef = useRef('');
  const [createInitialStatus, setCreateInitialStatus] = useState<Ticket['status'] | undefined>(undefined);
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);
  const [listSort, setListSort] = useState<TicketListSort>('newest_urgent');
  const { isMobile } = useWorkspaceViewMode(activeView, setView);
  const isWebMcpSupported = useMemo(() => supportsWebMcpRegistration(), []);
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
  const safeFilters = useMemo<TicketFilters>(() => ({
    status: filters?.status ?? '',
    priority: filters?.priority ?? '',
    projectId: filters?.projectId ?? '',
    labelId: filters?.labelId,
    domainId: filters?.domainId,
    labels: filters?.labels ?? [],
    labelMode: filters?.labelMode ?? 'any',
    cycleId: filters?.cycleId ?? '',
    assigneeId: filters?.assigneeId ?? '',
    search: filters?.search ?? '',
  }), [filters]);

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
  const shouldUseAggregateTicketPagination = isWorkspaceAllTasksPath || isTeamAggregatePath;
  const isAggregateDetailRoute = shouldUseAggregateTicketPagination && !!route.ticketKey;
  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
    error: workspaceDirectoryError,
    refreshWorkspaces,
    requestJoinByInvite,
  } = useWorkspaceDirectory({ currentUser });
  const workspacesResolvedForCurrentUser = !currentUser || workspacesResolvedUserId === currentUser.id;
  const workspacesById = useMemo(() => {
    const map = new Map<string, (typeof workspaces)[number]>();
    for (const workspace of workspaces) {
      map.set(workspace.id, workspace);
    }
    return map;
  }, [workspaces]);
  const activeWorkspace = workspacesById.get(activeWorkspaceId) || null;
  const activeWorkspaceProjects = useMemo(
    () => projectsByWorkspaceId.get(activeWorkspaceId) || [],
    [activeWorkspaceId, projectsByWorkspaceId]
  );
  const aiChatProjectId = activeProjectId || activeTicket?.projectId || activeWorkspace?.defaultProjectId || activeWorkspaceProjects[0]?.id || '';
  const {
    sessions: aiChatSessions,
    isLoading: aiChatSessionsLoading,
    isFetchingNextPage: aiChatSessionsFetchingNextPage,
    hasNextPage: aiChatSessionsHasNextPage,
    fetchNextPage: fetchNextAiChatSessionsPage,
    refreshSessions: refreshAiChatSessions,
  } = useChatSessionsList(aiChatProjectId);
  const isAiChatSessionProjectCurrent = activeAiChatSessionProjectId === aiChatProjectId;
  const currentSeedAiChatSessionId = isAiChatSessionProjectCurrent ? seedAiChatSessionId : '';
  const currentLiveAiChatSessionId = isAiChatSessionProjectCurrent ? liveAiChatSessionId : '';
  const currentSeedAiChatMessages = isAiChatSessionProjectCurrent ? seedAiChatMessages : undefined;

  useEffect(() => {
    latestAiChatProjectIdRef.current = aiChatProjectId;
  }, [aiChatProjectId]);
  const activeWorkspaceProjectIds = useMemo(
    () => new Set(activeWorkspaceProjects.map((project) => project.id)),
    [activeWorkspaceProjects]
  );
  const projectCreateError =
    projectCreateErrorState.workspaceId === activeWorkspaceId ? projectCreateErrorState.message : null;
  const labelCreateError = labelCreateErrorState.projectId === activeProjectId ? labelCreateErrorState.message : null;
  const setProjectCreateError = (message: string | null) => {
    setProjectCreateErrorState({ workspaceId: activeWorkspaceId, message });
  };
  const setLabelCreateError = (message: string | null, projectId: string = activeProjectId) => {
    setLabelCreateErrorState({ projectId, message });
  };

  const { data: sidebarTree } = useQuery<SidebarTree>({
    queryKey: queryKeys.workspaceSidebarTree(activeWorkspaceId),
    queryFn: () => apiClient.get<SidebarTree>(`/workspaces/${activeWorkspaceId}/sidebar`),
    enabled: !!activeWorkspaceId && !!currentUser,
    staleTime: CACHE_CONFIGS.workspaceSidebar.staleTime,
    gcTime: CACHE_CONFIGS.workspaceSidebar.gcTime,
  });

  const sidebarTeamIdByProjectId = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of sidebarTree?.teams ?? []) {
      for (const teamProject of team.projects ?? []) {
        map.set(teamProject.id, team.id);
      }
    }
    return map;
  }, [sidebarTree]);

  const aggregateScopeLabels = useMemo(() => {
    if (safeFilters.labels && safeFilters.labels.length > 0) {
      return [...safeFilters.labels];
    }

    const labelId = safeFilters.labelId || safeFilters.domainId;
    return labelId ? [labelId] : [];
  }, [safeFilters.domainId, safeFilters.labelId, safeFilters.labels]);

  const aggregateQueryParams = useMemo(
    () => ({
      status: safeFilters.status || undefined,
      priority: safeFilters.priority || undefined,
      assigneeId: safeFilters.assigneeId || undefined,
      cycleId: safeFilters.cycleId || undefined,
      labels: aggregateScopeLabels.length > 0 ? aggregateScopeLabels.join(',') : undefined,
      labelMode: aggregateScopeLabels.length > 0 ? safeFilters.labelMode : undefined,
    }),
    [aggregateScopeLabels, safeFilters.assigneeId, safeFilters.cycleId, safeFilters.labelMode, safeFilters.priority, safeFilters.status]
  );

  const {
    data: workspaceAggregatePages,
    fetchNextPage: fetchWorkspaceAggregateNextPage,
    hasNextPage: workspaceAggregateHasNextPage,
    isFetchingNextPage: workspaceAggregateIsFetchingNextPage,
    isLoading: workspaceAggregateTicketsLoading,
    isFetching: workspaceAggregateTicketsFetching,
  } = useInfiniteQuery<Ticket[]>({
    queryKey: ['workspaceTickets', activeWorkspaceId, aggregateQueryParams, 'paged'],
    queryFn: ({ pageParam = 0 }) =>
      apiClient.get<Ticket[]>('/tickets', {
        params: {
          workspaceId: activeWorkspaceId,
          ...aggregateQueryParams,
          limit: `${AGGREGATE_TICKETS_PAGE_SIZE}`,
          offset: `${pageParam}`,
        },
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < AGGREGATE_TICKETS_PAGE_SIZE
        ? undefined
        : allPages.length * AGGREGATE_TICKETS_PAGE_SIZE,
    initialPageParam: 0,
    enabled: isWorkspaceAllTasksPath && !isAggregateDetailRoute && !!activeWorkspaceId && !!currentUser,
    staleTime: CACHE_CONFIGS.ticketsList.staleTime,
    gcTime: CACHE_CONFIGS.ticketsList.gcTime,
  });

  const {
    data: teamAggregatePages,
    fetchNextPage: fetchTeamAggregateNextPage,
    hasNextPage: teamAggregateHasNextPage,
    isFetchingNextPage: teamAggregateIsFetchingNextPage,
    isLoading: teamAggregateTicketsLoading,
    isFetching: teamAggregateTicketsFetching,
  } = useInfiniteQuery<Ticket[]>({
    queryKey: ['teamTickets', route.teamIdParam, aggregateQueryParams, 'paged'],
    queryFn: ({ pageParam = 0 }) =>
      apiClient.get<Ticket[]>('/tickets', {
        params: {
          teamId: route.teamIdParam,
          ...aggregateQueryParams,
          limit: `${AGGREGATE_TICKETS_PAGE_SIZE}`,
          offset: `${pageParam}`,
        },
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < AGGREGATE_TICKETS_PAGE_SIZE
        ? undefined
        : allPages.length * AGGREGATE_TICKETS_PAGE_SIZE,
    initialPageParam: 0,
    enabled: isTeamAggregatePath && !isAggregateDetailRoute && !!route.teamIdParam && !!currentUser,
    staleTime: CACHE_CONFIGS.ticketsList.staleTime,
    gcTime: CACHE_CONFIGS.ticketsList.gcTime,
  });

  const { data: routeAggregateTicket, isLoading: routeAggregateTicketLoading } = useQuery<Ticket | null>({
    queryKey: ['ticketByKey', route.ticketKey],
    queryFn: () => apiClient.get<Ticket | null>(`/tickets/key/${route.ticketKey}`),
    enabled: isAggregateDetailRoute && !!route.ticketKey && !!currentUser,
    staleTime: CACHE_CONFIGS.ticketDetail.staleTime,
    gcTime: CACHE_CONFIGS.ticketDetail.gcTime,
  });

  const { data: routeAggregateProjectTickets = [], isLoading: routeAggregateProjectTicketsLoading } = useQuery<Ticket[]>({
    queryKey: queryKeys.tickets(routeAggregateTicket?.projectId || ''),
    queryFn: () => apiClient.get<Ticket[]>('/tickets', {
      projectId: routeAggregateTicket?.projectId,
    }),
    enabled: isAggregateDetailRoute && !!routeAggregateTicket?.projectId && !!currentUser,
    staleTime: CACHE_CONFIGS.ticketsList.staleTime,
    gcTime: CACHE_CONFIGS.ticketsList.gcTime,
  });

  const routeAggregateDetailTickets = useMemo(
    () => (routeAggregateTicket && routeAggregateProjectTickets.length === 0
      ? [routeAggregateTicket]
      : routeAggregateProjectTickets),
    [routeAggregateTicket, routeAggregateProjectTickets]
  );

  const workspaceAggregateTickets = useMemo(
    () => workspaceAggregatePages?.pages.flat() || [],
    [workspaceAggregatePages?.pages]
  );
  const teamAggregateTickets = useMemo(
    () => teamAggregatePages?.pages.flat() || [],
    [teamAggregatePages?.pages]
  );

  const aggregateWorkspaceHasMoreRows = isWorkspaceAllTasksPath && !isAggregateDetailRoute
    ? workspaceAggregateHasNextPage
    : false;
  const aggregateTeamHasMoreRows = isTeamAggregatePath && !isAggregateDetailRoute
    ? teamAggregateHasNextPage
    : false;
  const aggregateIsLoadingMoreRows = isWorkspaceAllTasksPath && !isAggregateDetailRoute
    ? workspaceAggregateIsFetchingNextPage
    : isTeamAggregatePath && !isAggregateDetailRoute
      ? teamAggregateIsFetchingNextPage
      : false;

  const scopedProjectTicketsFetching = useIsFetching({
    queryKey: queryKeys.tickets(projectIdParam || activeProjectId || ''),
    exact: true,
  });

  const projectTicketsQueries = useQueries({
    queries: activeWorkspaceProjects.map((project) => ({
      queryKey: queryKeys.tickets(project.id),
      queryFn: () => apiClient.get<Ticket[]>('/tickets', { projectId: project.id }),
      enabled: false,
      staleTime: CACHE_CONFIGS.ticketsList.staleTime,
      gcTime: CACHE_CONFIGS.ticketsList.gcTime,
    })),
  });

  const projectLabelsQueries = useQueries({
    queries: activeWorkspaceProjects.map((project) => ({
      queryKey: queryKeys.labels(project.id),
      queryFn: () => apiClient.get<Label[]>('/labels', { params: { projectId: project.id }, projectId: project.id }),
      enabled: activeSection === 'projects',
      staleTime: CACHE_CONFIGS.metadata.staleTime,
      gcTime: CACHE_CONFIGS.metadata.gcTime,
    })),
  });

  const ticketsByProjectIdFromQueries = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    activeWorkspaceProjects.forEach((project, idx) => {
      queryClient.getQueryData(queryKeys.tickets(project.id));
      const data = projectTicketsQueries[idx]?.data;
      if (Array.isArray(data)) {
        map.set(project.id, data);
      }
    });
    return map;
  }, [activeWorkspaceProjects, projectTicketsQueries, queryClient]);

  const labelsByProjectIdFromQueries = useMemo(() => {
    const map = new Map<string, Label[]>();
    activeWorkspaceProjects.forEach((project, idx) => {
      queryClient.getQueryData(queryKeys.labels(project.id));
      const data = projectLabelsQueries[idx]?.data;
      if (Array.isArray(data)) {
        map.set(project.id, data);
      }
    });
    return map;
  }, [activeWorkspaceProjects, projectLabelsQueries, queryClient]);

  const labelsByProject = useMemo(() => {
    const cachedLabelsByProject = new Map<string, Label[]>();
    const appendProjectLabels = (projectId: string, projectLabels: Label[]) => {
      if (!projectLabels.length) {
        if (!cachedLabelsByProject.has(projectId)) {
          cachedLabelsByProject.set(projectId, []);
        }
        return;
      }

      const mergedLabels = new Map<string, Label>(projectLabels.map((label) => [label.id, label]));
      const currentLabels = cachedLabelsByProject.get(projectId);
      for (const label of currentLabels ?? []) {
        mergedLabels.set(label.id, label);
      }

      cachedLabelsByProject.set(projectId, Array.from(mergedLabels.values()));
    };

    for (const project of activeWorkspaceProjects) {
      cachedLabelsByProject.set(project.id, []);
    }

    for (const team of sidebarTree?.teams ?? []) {
      for (const project of team.projects ?? []) {
        if (!activeWorkspaceProjectIds.has(project.id)) {
          continue;
        }

        const projectLabels = team.labels ?? [];
        appendProjectLabels(project.id, projectLabels.filter((label) => label.projectId === project.id));
      }
    }

    for (const project of activeWorkspaceProjects) {
      const queryLabels = labelsByProjectIdFromQueries.get(project.id);
      appendProjectLabels(project.id, queryLabels ?? []);
    }

    return cachedLabelsByProject;
  }, [activeWorkspaceProjectIds, activeWorkspaceProjects, labelsByProjectIdFromQueries, sidebarTree]);

  const workspaceProjectLabels = useMemo(() => {
    const dedupedWorkspaceLabels = new Map<string, Label>();

    for (const project of activeWorkspaceProjects) {
      const projectLabels = labelsByProject.get(project.id) ??
        (project.id === activeProjectId ? labels.filter((label) => label.projectId === project.id) : []);
      for (const label of projectLabels) {
        if (label.projectId !== project.id) {
          continue;
        }

        dedupedWorkspaceLabels.set(label.id, label);
      }
    }

    return [...dedupedWorkspaceLabels.values()];
  }, [activeProjectId, activeWorkspaceProjects, labels, labelsByProject]);

  useEffect(() => {
    if (activeSection !== 'projects' || !currentUser || activeWorkspaceProjects.length === 0) {
      return;
    }

    for (const project of activeWorkspaceProjects) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.labels(project.id),
        queryFn: () => apiClient.get<Label[]>('/labels', {
          params: { projectId: project.id },
          projectId: project.id,
        }),
        ...CACHE_CONFIGS.metadata,
      });
    }
  }, [activeSection, activeWorkspaceProjects, currentUser, queryClient]);

  const isScopedTicketsLoading = useMemo(
    () => {
      if (!currentUser) {
        return false;
      }

      if (shouldUseAggregateTicketPagination) {
        if (isAggregateDetailRoute) {
          return routeAggregateTicketLoading || routeAggregateProjectTicketsLoading;
        }

        if (isWorkspaceAllTasksPath) {
          return workspaceAggregateTicketsLoading || workspaceAggregateTicketsFetching;
        }

        if (isTeamAggregatePath) {
          return teamAggregateTicketsLoading || teamAggregateTicketsFetching;
        }

        return false;
      }

      return scopedProjectTicketsFetching > 0;
    },
    [
      currentUser,
      isAggregateDetailRoute,
      isTeamAggregatePath,
      isWorkspaceAllTasksPath,
      routeAggregateProjectTicketsLoading,
      routeAggregateTicketLoading,
      scopedProjectTicketsFetching,
      shouldUseAggregateTicketPagination,
      teamAggregateTicketsFetching,
      teamAggregateTicketsLoading,
      workspaceAggregateTicketsFetching,
      workspaceAggregateTicketsLoading,
    ]
  );

  const aggregateLoadMoreInFlightRef = useRef(false);

  const aggregateLoadMoreRows = useCallback(() => {
    if (aggregateLoadMoreInFlightRef.current || aggregateIsLoadingMoreRows) {
      return;
    }

    let loadMoreRequest = undefined as ReturnType<typeof fetchWorkspaceAggregateNextPage> | ReturnType<typeof fetchTeamAggregateNextPage> | undefined;

    if (isWorkspaceAllTasksPath && !isAggregateDetailRoute && workspaceAggregateHasNextPage) {
      aggregateLoadMoreInFlightRef.current = true;
      loadMoreRequest = fetchWorkspaceAggregateNextPage();
    } else if (isTeamAggregatePath && !isAggregateDetailRoute && teamAggregateHasNextPage) {
      aggregateLoadMoreInFlightRef.current = true;
      loadMoreRequest = fetchTeamAggregateNextPage();
    }

    if (!loadMoreRequest) {
      return;
    }

    Promise.resolve(loadMoreRequest).finally(() => {
      aggregateLoadMoreInFlightRef.current = false;
    });
  }, [
    fetchTeamAggregateNextPage,
    fetchWorkspaceAggregateNextPage,
    aggregateIsLoadingMoreRows,
    isAggregateDetailRoute,
    isTeamAggregatePath,
    isWorkspaceAllTasksPath,
    teamAggregateHasNextPage,
    workspaceAggregateHasNextPage,
  ]);

  const aggregateHasMoreRows = isWorkspaceAllTasksPath ? aggregateWorkspaceHasMoreRows : aggregateTeamHasMoreRows;

  useEffect(() => {
    if (!aggregateIsLoadingMoreRows) {
      aggregateLoadMoreInFlightRef.current = false;
    }
  }, [aggregateIsLoadingMoreRows]);

  const { data: teamCycles = [] } = useQuery<Cycle[]>({
    queryKey: ['teamCycles', route.teamIdParam],
    queryFn: () => apiClient.get<Cycle[]>('/cycles', { params: { teamId: route.teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
    staleTime: CACHE_CONFIGS.metadata.staleTime,
    gcTime: CACHE_CONFIGS.metadata.gcTime,
  });

  const { data: teamLabels = [] } = useQuery<Label[]>({
    queryKey: ['teamLabels', route.teamIdParam],
    queryFn: () => apiClient.get<Label[]>('/labels', { params: { teamId: route.teamIdParam } }),
    enabled: isTeamAggregatePath && !!currentUser,
    staleTime: CACHE_CONFIGS.metadata.staleTime,
    gcTime: CACHE_CONFIGS.metadata.gcTime,
  });

  const routeScopedTickets = useMemo(
    () =>
      isWorkspaceAllTasksPath
        ? isAggregateDetailRoute
          ? routeAggregateDetailTickets
          : workspaceAggregateTickets
        : isTeamAggregatePath
          ? isAggregateDetailRoute
            ? routeAggregateDetailTickets
            : teamAggregateTickets
          : tickets,
    [
      isAggregateDetailRoute,
      isTeamAggregatePath,
      isWorkspaceAllTasksPath,
      teamAggregateTickets,
      tickets,
      workspaceAggregateTickets,
      routeAggregateDetailTickets,
    ]
  );
  const sharedLinkFallbackRoute = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const ticketCountsByProject = useMemo(() => {
    return createWorkspaceProjectCounts(
      activeWorkspaceProjects,
      (projectId) => ticketsByProjectIdFromQueries.get(projectId),
      currentUser?.id
    );
  }, [activeWorkspaceProjects, ticketsByProjectIdFromQueries, currentUser?.id]);

  const scopedTicketMaps = useMemo(() => {
    const mapByKey = new Map<string, Ticket>();
    const mapById = new Map<string, Ticket>();

    for (const ticket of routeScopedTickets) {
      const ticketKey = ticket.key?.toUpperCase();
      if (ticketKey) {
        mapByKey.set(ticketKey, ticket);
      }
      mapById.set(ticket.id, ticket);
    }

    return { mapByKey, mapById };
  }, [routeScopedTickets]);
  const scopedTicketsByKey = scopedTicketMaps.mapByKey;
  const scopedTicketsById = scopedTicketMaps.mapById;
  const parentTicket = useMemo(
    () => (createParentId ? scopedTicketsById.get(createParentId) || null : null),
    [createParentId, scopedTicketsById]
  );
  const activeProject = useMemo(
    () => projectById.get(projectIdParam || activeProjectId) || null,
    [activeProjectId, projectById, projectIdParam]
  );

  useAppShellRouteSync({
    route,
    activeTicket,
    routeScopedTicketByKey: scopedTicketsByKey,
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
    settingsHydrated = true,
    savedCredentials: accountSavedCredentials,
  } = useAccountSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme: setDsTheme,
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
  }, [activeWorkspaceId, queryClient]);

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

  const {
    isTeamProjectsManager,
    isTeamWorkspace,
    isTeamsManager,
    isWorkspaceOwner,
    sidebarActiveTeamId,
    sidebarNavigationState,
  } = useMemo(() => {
    const activeProjectTeamId =
      activeProject?.teamId ||
      (projectIdParam || activeProjectId ? sidebarTeamIdByProjectId.get(projectIdParam || activeProjectId) || '' : '') ||
      '';

    const resolvedSidebarActiveTeamId = route.teamIdParam || activeProjectTeamId;
    const resolvedIsTeamWorkspace = (sidebarTree?.hierarchyMode ?? activeWorkspace?.hierarchyMode ?? 'workspace') === 'teams';
    const resolvedIsWorkspaceOwner = activeWorkspace?.memberRole === 'owner';

    return {
      isTeamProjectsManager: activeSection === 'team-projects',
      isTeamWorkspace: resolvedIsTeamWorkspace,
      isTeamsManager: activeSection === 'teams' || (resolvedIsTeamWorkspace && activeSection === 'projects'),
      isWorkspaceOwner: resolvedIsWorkspaceOwner,
      sidebarActiveTeamId: resolvedSidebarActiveTeamId,
      sidebarNavigationState: {
        activeTeam: resolvedSidebarActiveTeamId,
        activeScope: route.teamIdParam
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
      } as SidebarNavigationState,
    };
  }, [
    activeSection,
    activeProject,
    activeProjectId,
    activeWorkspace?.hierarchyMode,
    activeWorkspace?.memberRole,
    projectIdParam,
    route.activeLabelIdParam,
    route.cycleIdParam,
    route.projectIdParam,
    route.teamIdParam,
    sidebarTeamIdByProjectId,
    sidebarTree?.hierarchyMode,
  ]);

  const accountCredentialByProvider = useMemo(() => {
    const map = new Map<string, { preferredModel?: string }>();
    const safeAccountCredentials = accountSavedCredentials ?? [];
    for (const credential of safeAccountCredentials) {
      map.set(credential.provider, credential);
    }
    return map;
  }, [accountSavedCredentials]);

  const preferredProviderModel = accountSettings.aiProvider ? accountCredentialByProvider.get(accountSettings.aiProvider)?.preferredModel || '' : '';
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
    setActiveTicket,
  });

  const {
    handleCreateProject,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  } = useWorkspaceManagementCommands({
    activeWorkspaceId,
    currentUser,
    activeProjectId,
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
  });

  const { handleSetFilters } = useWorkspaceShellFilters({
    filters: safeFilters,
    searchParams,
    setSearchParams,
  });

  const handleToggleAskAgent = useCallback(() => {
    if (!isAgentOpen && !isAgentClosing) {
      setSeedAiChatSessionId('');
      setLiveAiChatSessionId('');
      setSeedAiChatMessages(undefined);
      setActiveAiChatSessionProjectId(aiChatProjectId);
    }

    handleToggleAgent();
  }, [aiChatProjectId, handleToggleAgent, isAgentClosing, isAgentOpen]);

  const handleAiChatSessionCreated = useCallback((chatId: string) => {
    setLiveAiChatSessionId(chatId);
    setActiveAiChatSessionProjectId(aiChatProjectId);
    refreshAiChatSessions();
  }, [aiChatProjectId, refreshAiChatSessions]);

  const handleSelectAiChatHistory = useCallback(async (chatId: string) => {
    if (!aiChatProjectId) {
      return;
    }

    const requestProjectId = aiChatProjectId;
    const requestId = aiChatHistoryRequestIdRef.current + 1;
    aiChatHistoryRequestIdRef.current = requestId;
    const isLatestRequest = () =>
      aiChatHistoryRequestIdRef.current === requestId && latestAiChatProjectIdRef.current === requestProjectId;

    try {
      const detail = await getChatSession(requestProjectId, chatId);
      if (!isLatestRequest()) {
        return;
      }

      setSeedAiChatSessionId(chatId);
      setLiveAiChatSessionId(chatId);
      setSeedAiChatMessages(toChatMessages(detail));
      setActiveAiChatSessionProjectId(requestProjectId);
    } catch (error) {
      if (!isLatestRequest()) {
        return;
      }

      console.error('Failed to load chat session:', error);
      setSeedAiChatSessionId(chatId);
      setLiveAiChatSessionId(chatId);
      setSeedAiChatMessages([{ role: 'system', content: 'Failed to load this chat. Please try again.' }]);
      setActiveAiChatSessionProjectId(requestProjectId);
    } finally {
      if (isLatestRequest()) {
        handleOpenAgent();
      }
    }
  }, [aiChatProjectId, handleOpenAgent]);

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

  const { openTicketsCount, myIssuesCount, labelCounts, cycleCounts } = useWorkspaceSidebarCounts({
    tickets,
    labels,
    cycles,
    currentUserId: currentUser?.id,
  });

  const scopedFilters = useMemo(
    () => ({
      ...safeFilters,
      projectId: shouldUseAggregateTicketScope ? '' : safeFilters.projectId,
    }),
    [safeFilters, shouldUseAggregateTicketScope]
  );

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        handleToggleAskAgent();
        return;
      }

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
        if (activeSection === 'workspace') {
          handleOpenCreateTicket();
        } else {
          navigate(`/workspaces/${activeWorkspaceId}`);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeSection, activeWorkspaceId, handleOpenCreateTicket, handleToggleAskAgent, navigate]);

  const handleOpenCurrentTeamProjectsManager = useCallback(() => {
    if (sidebarActiveTeamId) {
      handleOpenTeamProjectsManager(sidebarActiveTeamId);
      return;
    }

    handleOpenTeamManager();
  }, [sidebarActiveTeamId, handleOpenTeamManager, handleOpenTeamProjectsManager]);

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser || (currentUser && !settingsHydrated)) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (route.workspaceId && workspacesResolvedForCurrentUser && !workspacesLoading) {
    if (workspaceDirectoryError) {
      return <Navigate to="/workspace-access-error" replace state={{ from: sharedLinkFallbackRoute }} />;
    }

    if (!workspacesById.has(route.workspaceId)) {
      return <Navigate to="/workspace-access-denied" replace />;
    }
  }

  if (!activeWorkspace) {
    return <LoadingPage />;
  }

  const onboarding = !localTutorialCompleted && accountSettings.tutorialCompleted === false ? (
    <OnboardingModal
      onComplete={async () => {
        setLocalTutorialCompleted(true);
        try {
          await patchTutorialCompleted(currentUser.id, true);
        } catch {
          // Ignore
        }
      }}
    />
  ) : null;

  const scopedProjects = teamIdParam
    ? activeWorkspaceProjects.filter((project) => project.teamId === teamIdParam)
    : activeWorkspaceProjects;
  const scopedTickets = routeScopedTickets;
  const scopedCycles = isTeamAggregatePath ? teamCycles : cycles;
  const scopedProjectId = projectIdParam || activeProjectId;
  const scopedLabels = isTeamAggregatePath
    ? teamLabels
    : labels.filter((label) => label.projectId === scopedProjectId);

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
      onPrefetchProject: fetchProjectData,
      onHasCachedProjectData: (projectId) => ticketsByProjectIdFromQueries.has(projectId),
      labels,
      labelsByProject,
      cycles,
      currentUser,
      activeProjectId,
      filters: safeFilters,
      counts: {
        myIssues: myIssuesCount,
        activeProjectIssues: openTicketsCount,
        labels: labelCounts,
        cycles: cycleCounts,
        byProject: ticketCountsByProject,
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
      onOpenAgent: handleToggleAskAgent,
      isAgentOpen,
      onOpenSimulator: () => {},
      onOpenCreateTicket: activeSection === 'workspace' ? handleOpenCreateTicket : () => navigate(`/workspaces/${activeWorkspaceId}`),
      onOpenCreateProject: handleOpenCreateProject,
      onOpenCreateLabel: handleOpenCreateLabel,
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
      onSignOut: () => {
        void signOut();
      },
    },
  };

  const createDefaultProjectId =
    activeProjectId || scopedProjects[0]?.id || activeWorkspaceProjects[0]?.id || '';
  const isWorkspaceProjectsListActive = sidebarActiveScope === 'workspace-projects';
  const isIssueSurfaceActive =
    !isWorkspaceProjectsListActive && !isTeamsManager && !isTeamProjectsManager && activeSection !== 'projects';
  const workspaceWebMcpRegistration = isWebMcpSupported ? (
    <WorkspaceWebMcpRegistration
      tickets={tickets}
      users={users}
      projects={projects}
    />
  ) : null;

  return (
    <>
      <WorkspaceLayout
        sidebarProps={sidebarProps}
        isMobile={isMobile}
        headerChatHistory={
          <ChatHistoryHeaderRow
            sessions={aiChatSessions}
            activeSessionId={currentSeedAiChatSessionId || currentLiveAiChatSessionId}
            isLoading={aiChatSessionsLoading}
            onSelectSession={(chatId) => void handleSelectAiChatHistory(chatId)}
          />
        }
        headerChatHistoryMenu={
          <ChatHistoryMenuButton
            sessions={aiChatSessions}
            activeSessionId={currentSeedAiChatSessionId || currentLiveAiChatSessionId}
            isLoading={aiChatSessionsLoading}
            isFetchingMoreSessions={aiChatSessionsFetchingNextPage}
            hasMoreSessions={aiChatSessionsHasNextPage}
            onLoadMoreSessions={() => void fetchNextAiChatSessionsPage()}
            onSelectSession={(chatId) => void handleSelectAiChatHistory(chatId)}
          />
        }
        rightPanels={
          isAgentOpen || isAgentClosing ? (
            <AiChatDock
              onClose={handleToggleAgent}
              initialModel={preferredProviderModel}
              settings={accountSettings}
              workspaceId={activeWorkspaceId}
              projectId={aiChatProjectId}
              isClosing={isAgentClosing}
              isMobile={isMobile}
              seedChatSessionId={currentSeedAiChatSessionId}
              seedMessages={currentSeedAiChatMessages}
              onSessionCreated={handleAiChatSessionCreated}
              ticketAttachmentScopeMode={isTeamWorkspace ? 'team' : 'project'}
              ticketAttachmentProjects={activeWorkspaceProjects}
              ticketAttachmentTeams={sidebarTree?.teams ?? []}
              ticketAttachmentDefaultScopeId={isTeamWorkspace ? sidebarActiveTeamId : aiChatProjectId}
            />
          ) : null
        }
      >
        {!isIssueSurfaceActive && workspaceWebMcpRegistration ? (
          <WorkspaceTicketActionProviders>
            {workspaceWebMcpRegistration}
          </WorkspaceTicketActionProviders>
        ) : null}

        {isWorkspaceProjectsListActive ? (
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
            onCreateProject={handleCreateProject}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : activeSection === 'projects' ? (
          <WorkspacePageLayout
            title="Manage Projects"
            pageClassName="workspace-projects-page"
            contentClassName="workspace-projects-page__content"
            wrapBody={false}
            actions={
              <div className="workspace-projects-page__actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/workspaces/${activeWorkspaceId}`)}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Workspace</span>
                </Button>
              </div>
            }
          >
            <WorkspaceProjectPanel
              workspaceName={activeWorkspace.name}
              projects={activeWorkspaceProjects}
              activeProjectId={activeProjectId}
              defaultProjectId={activeWorkspace.defaultProjectId ?? null}
              labels={workspaceProjectLabels}
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
              onDeleteProject={deleteProject}
            />
          </WorkspacePageLayout>
        ) : (
          <WorkspaceTicketActionProviders>
            {workspaceWebMcpRegistration}
            <WorkspaceIssueSurface
              activeWorkspaceId={activeWorkspaceId}
              workspaceName={activeWorkspace.name}
              pathname={pathname}
              activeContext={activeContext}
              activeNoteId={activeNoteId}
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
              projectsLoading={loading}
              tickets={scopedTickets}
              users={users}
              routeTicketKey={route.ticketKey}
              ticketsByKey={scopedTicketsByKey}
              ticketsById={scopedTicketsById}
              ticketsByParentId={ticketsByParentId}
              isLoadingTickets={isScopedTicketsLoading}
              onOpenCreateTicket={handleOpenCreateTicket}
              onOpenCreateSubtask={handleOpenCreateSubtask}
              onOpenProjectManager={handleOpenProjectManager}
              onOpenTeamManager={handleOpenTeamManager}
              onOpenTeamProjectManager={handleOpenCurrentTeamProjectsManager}
              onSelectTicket={handleSelectTicket}
              onSelectNote={handleSelectNote}
              onSetFilters={handleSetFilters}
              onSetListSort={setListSort}
              onSetView={setView}
              onLoadMoreTickets={shouldUseAggregateTicketPagination ? aggregateLoadMoreRows : undefined}
              hasMoreTickets={shouldUseAggregateTicketPagination ? aggregateHasMoreRows : false}
              isLoadingMoreTickets={shouldUseAggregateTicketPagination ? aggregateIsLoadingMoreRows : false}
              createTicket={{
                isOpen: isCreateModalOpen,
                onClose: () => setIsCreateModalOpen(false),
                projects: activeWorkspaceProjects,
                labels: scopedLabels,
                cycles: scopedCycles,
                users,
                parentTicket,
                defaultProjectId: createDefaultProjectId,
                initialStatus: createInitialStatus,
                parentId: createParentId,
              }}
              navigation={{
                navigate,
                buildProjectScopedPath,
                setActiveTicket,
              }}
            />
          </WorkspaceTicketActionProviders>
        )}
      </WorkspaceLayout>

      <AppShellOverlays
        onboarding={onboarding}
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
