import { useCallback, useEffect, useMemo, useState } from 'react';
import { authClient } from '../../../context/auth/authClient';
import { useInfiniteQuery, useIsFetching, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { SidebarNavigationState, SidebarProps } from '../../../components/Sidebar';
import { WorkspaceLayout } from '../../../layouts/WorkspaceLayout/WorkspaceLayout';
import { LocalAIChat } from '../../ai';
import { Button } from '@library';
import { AuthScreen } from '../../auth';
import type { TicketFilters, TicketListSort } from '../../tickets';
import { TicketDetailRoute } from '../../tickets';
import type { WorkspaceIssueView } from '../../workspacePage/screens/WorkspacePage';
import { OnboardingModal } from '../../onboarding';
import { useTheme } from '../../settings';
import type { Ticket } from '../../../context/TicketContextContext';
import { useTickets } from '../../../context/TicketContextContext';
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
import type { AppSection } from '../types/AppShell';
import { LoadingPage } from '../../loadingPage';
import { CACHE_CONFIGS, queryClient, queryKeys } from '../../../utils/queryClient';
import {
  useWorkspaceCreateLabelDialog,
  useWorkspaceCreateProjectDialog,
  useWorkspaceCreateTicketDialog,
  useWorkspaceShellCommands,
  useWorkspaceShellFilters,
  useWorkspaceShellNavigation,
  useWorkspaceSidebarCounts,
  WorkspaceProjectPanel,
  WorkspaceTeamProjectsPanel,
} from '../../workspaces';
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
    fetchProjectData,
    deleteProject,
    deleteTicket,
    labels = [],
    filters,
    loading,
    projects,
    setActiveProjectId,
    setActiveTicket,
    setFilters,
    setView,
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
  const [localTutorialCompleted, setLocalTutorialCompleted] = useState(false);
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
  const [listSort, setListSort] = useState<TicketListSort>('newest_urgent');
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
  const shouldUseAggregateTicketPagination = isWorkspaceAllTasksPath || isTeamAggregatePath;
  const isAggregateDetailRoute = shouldUseAggregateTicketPagination && !!route.ticketKey;
  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
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
  const projectsById = useMemo(() => {
    const map = new Map<string, (typeof projects)[number]>();
    for (const project of projects) {
      map.set(project.id, project);
    }
    return map;
  }, [projects]);
  const activeWorkspace = workspacesById.get(activeWorkspaceId) || null;
  const activeWorkspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId]
  );
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
  const labelsQueryFetching = useIsFetching({
    queryKey: ['labels'],
  });

  const labelsByProject = useMemo(() => {
    const cachedLabelsByProject = new Map<string, Label[]>();

    for (const team of sidebarTree?.teams ?? []) {
      for (const label of team.labels ?? []) {
        if (!label.projectId || !activeWorkspaceProjectIds.has(label.projectId)) {
          continue;
        }

        const projectLabels = cachedLabelsByProject.get(label.projectId) ?? [];
        projectLabels.push(label);
        cachedLabelsByProject.set(label.projectId, projectLabels);
      }
    }

    for (const [queryKey, cachedLabels] of queryClient.getQueriesData<Label[]>({ queryKey: ['labels'] })) {
      const queryProjectId = queryKey[1];
      const projectId =
        queryProjectId && typeof queryProjectId === 'object' && 'projectId' in queryProjectId
          ? (queryProjectId as { projectId?: string }).projectId
          : undefined;

      if (!projectId || !activeWorkspaceProjectIds.has(projectId) || !Array.isArray(cachedLabels)) {
        continue;
      }

      cachedLabelsByProject.set(
        projectId,
        cachedLabels.filter((label) => label.projectId === projectId),
      );
    }

    return cachedLabelsByProject;
  }, [activeWorkspaceProjectIds, labelsQueryFetching, sidebarTree]);

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
  }, [activeSection, activeWorkspaceProjects, currentUser]);

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

  const aggregateLoadMoreRows = useCallback(() => {
    if (isWorkspaceAllTasksPath && !isAggregateDetailRoute && workspaceAggregateHasNextPage) {
      void fetchWorkspaceAggregateNextPage();
      return;
    }

    if (isTeamAggregatePath && !isAggregateDetailRoute && teamAggregateHasNextPage) {
      void fetchTeamAggregateNextPage();
    }
  }, [
    fetchTeamAggregateNextPage,
    fetchWorkspaceAggregateNextPage,
    isAggregateDetailRoute,
    isTeamAggregatePath,
    isWorkspaceAllTasksPath,
    teamAggregateHasNextPage,
    workspaceAggregateHasNextPage,
  ]);

  const aggregateHasMoreRows = isWorkspaceAllTasksPath ? aggregateWorkspaceHasMoreRows : aggregateTeamHasMoreRows;

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
  const ticketCountsByProject = useMemo(() => {
    const countsByProject: Record<
      string,
      {
        myIssues: number;
        activeProjectIssues: number;
        labels: Record<string, number>;
        cycles: Record<string, number>;
      }
    > = Object.fromEntries(
      activeWorkspaceProjects.map((project) => [
        project.id,
        {
          myIssues: 0,
          activeProjectIssues: 0,
          labels: {},
          cycles: {},
        },
      ])
    );

    const cachedProjectTickets = queryClient
      .getQueriesData<Ticket[]>({ queryKey: ['tickets'] })
      .map(([, cachedTickets]) => cachedTickets)
      .filter((cachedTickets): cachedTickets is Ticket[] => Array.isArray(cachedTickets));

    for (const projectTickets of cachedProjectTickets) {
      for (const ticket of projectTickets) {
        if (ticket.status === 'done' || ticket.status === 'canceled') {
          continue;
        }

        const existing = countsByProject[ticket.projectId] ?? {
          myIssues: 0,
          activeProjectIssues: 0,
          labels: {},
          cycles: {},
        };

        const nextLabels = { ...existing.labels };
        const nextCycles = { ...existing.cycles };

        if (ticket.labelIds?.length) {
          for (const labelId of ticket.labelIds) {
            nextLabels[labelId] = (nextLabels[labelId] ?? 0) + 1;
          }
        }

        if (ticket.cycleId) {
          nextCycles[ticket.cycleId] = (nextCycles[ticket.cycleId] ?? 0) + 1;
        }

        countsByProject[ticket.projectId] = {
          myIssues: existing.myIssues + (ticket.assigneeId === currentUser?.id ? 1 : 0),
          activeProjectIssues: existing.activeProjectIssues + 1,
          labels: nextLabels,
          cycles: nextCycles,
        };
      }
    }

    return countsByProject;
  }, [activeWorkspaceProjects, currentUser?.id, tickets]);

  const scopedTicketsByKey = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const ticket of routeScopedTickets) {
      const ticketKey = ticket.key?.toUpperCase();
      if (!ticketKey) {
        continue;
      }
      map.set(ticketKey, ticket);
    }
    return map;
  }, [routeScopedTickets]);
  const scopedTicketsById = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const ticket of routeScopedTickets) {
      map.set(ticket.id, ticket);
    }
    return map;
  }, [routeScopedTickets]);
  const parentTicket = useMemo(
    () => (createParentId ? scopedTicketsById.get(createParentId) || null : null),
    [createParentId, scopedTicketsById]
  );
  const activeProject = useMemo(
    () => projectsById.get(projectIdParam || activeProjectId) || null,
    [activeProjectId, projectIdParam, projectsById]
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
    ollamaModels,
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
    sidebarTree?.teams,
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
    handleCreateTicketSubmit,
    handleDeleteTicket,
    handleCreateProject,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  } = useWorkspaceShellCommands({
    activeWorkspaceId,
    currentUser,
    ticketsById: scopedTicketsById,
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
    filters: safeFilters,
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

  const handleOpenCurrentTeamProjectsManager = useCallback(() => {
    if (sidebarActiveTeamId) {
      handleOpenTeamProjectsManager(sidebarActiveTeamId);
      return;
    }

    handleOpenTeamManager();
  }, [sidebarActiveTeamId, handleOpenTeamManager, handleOpenTeamProjectsManager]);

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (!activeWorkspace) {
    return <LoadingPage />;
  }

  const onboarding = !localTutorialCompleted && accountSettings.tutorialCompleted === false ? (
    <OnboardingModal
      onComplete={async () => {
        setLocalTutorialCompleted(true);
        try {
          await fetch(`/api/v1/users/${currentUser.id}/tutorial`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true }),
          });
        } catch (e) {
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
      onHasCachedProjectData: (projectId) => queryClient.getQueryData<Ticket[]>(queryKeys.tickets(projectId)) !== undefined,
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
      onSignOut: () => authClient.signOut(),
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
                  ? preferredProviderModel
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
        ) : route.ticketKey ? (
          <TicketDetailRoute
            activeWorkspaceId={activeWorkspaceId}
            activeTicket={scopedTicketsByKey.get(route.ticketKey?.toUpperCase() || '') || activeTicket}
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
            ticketsById={scopedTicketsById}
            isLoading={isScopedTicketsLoading}
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
            projectsLoading={loading}
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
            onLoadMoreTickets={shouldUseAggregateTicketPagination ? aggregateLoadMoreRows : undefined}
            hasMoreTickets={shouldUseAggregateTicketPagination ? aggregateHasMoreRows : false}
            isLoadingMoreTickets={shouldUseAggregateTicketPagination ? aggregateIsLoadingMoreRows : false}
            isLoadingTickets={isScopedTicketsLoading}
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
