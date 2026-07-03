import { useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTicketRelationsSnapshot } from '../../../hooks/useTicketRelationsSnapshot';

export function useAppShellRoute(currentUserId?: string) {
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
  const isWorkspaceChatPath = !!workspaceId && (
    pathname === `/workspaces/${workspaceId}/chat` ||
    pathname === `/workspaces/${workspaceId}/chat/`
  );
  const isTeamAggregatePath = !!teamIdParam && !projectIdParam;
  const shouldUseAggregateTicketScope = isWorkspaceAllTasksPath || isTeamAggregatePath;
  const shouldKeepActiveProjectSelection =
    isWorkspaceAllTasksPath || isWorkspaceProjectsListPath || isWorkspaceChatPath || isTeamAggregatePath;

  useTicketRelationsSnapshot(ticketKey, currentUserId);

  return useMemo(() => ({
    workspaceId,
    projectIdParam,
    teamIdParam,
    viewIdParam,
    cycleIdParam,
    labelIdParam,
    legacyDomainIdParam,
    activeLabelIdParam,
    ticketKey,
    noteId,
    pathname,
    searchParams,
    setSearchParams,
    navigate,
    isWorkspaceAllTasksPath,
    isWorkspaceProjectsListPath,
    isWorkspaceChatPath,
    isTeamAggregatePath,
    shouldUseAggregateTicketScope,
    shouldKeepActiveProjectSelection,
  }), [
    activeLabelIdParam,
    cycleIdParam,
    isTeamAggregatePath,
    isWorkspaceAllTasksPath,
    isWorkspaceProjectsListPath,
    isWorkspaceChatPath,
    labelIdParam,
    legacyDomainIdParam,
    navigate,
    noteId,
    pathname,
    projectIdParam,
    searchParams,
    setSearchParams,
    shouldKeepActiveProjectSelection,
    shouldUseAggregateTicketScope,
    teamIdParam,
    ticketKey,
    viewIdParam,
    workspaceId,
  ]);
}

export type AppShellRouteState = ReturnType<typeof useAppShellRoute>;
