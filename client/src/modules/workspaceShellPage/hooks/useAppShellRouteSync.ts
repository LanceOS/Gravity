import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { SidebarNavigationState } from '../../../components/Sidebar';
import type { Ticket, TicketFiltersState } from '../../../context/TicketContext';
import type { AppSection } from '../types/AppShell';
import type { AppShellRouteState } from './useAppShellRoute';

type SyncedFilterParams = {
  labels: string[];
  labelMode: 'all' | 'any';
  cycleId: string;
  labelId: string;
  assigneeId: string;
  status: string;
  priority: string;
  search: string;
};

function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

interface UseAppShellRouteSyncArgs {
  route: AppShellRouteState;
  activeTicket: Ticket | null;
  routeScopedTicketByKey: Map<string, Ticket>;
  setActiveSection: Dispatch<SetStateAction<AppSection>>;
  setActiveWorkspaceId: Dispatch<SetStateAction<string>>;
  setActiveContext: Dispatch<SetStateAction<'issues' | 'notes'>>;
  setActiveNoteId: Dispatch<SetStateAction<string>>;
  setSidebarActiveScope: Dispatch<SetStateAction<SidebarNavigationState['activeScope']>>;
  setActiveProjectId: (projectId: string) => void;
  setActiveTicket: (ticket: Ticket | null) => void;
  setFilters: (filters: Partial<TicketFiltersState>) => void;
}

export function useAppShellRouteSync({
  route,
  activeTicket,
  setActiveSection,
  setActiveWorkspaceId,
  setActiveContext,
  setActiveNoteId,
  setSidebarActiveScope,
  setActiveProjectId,
  setActiveTicket,
  setFilters,
  routeScopedTicketByKey,
}: UseAppShellRouteSyncArgs) {
  const lastSyncedFilterParams = useRef<SyncedFilterParams>({
    labels: [],
    labelMode: 'any',
    cycleId: '',
    labelId: '',
    assigneeId: '',
    status: '',
    priority: '',
    search: '',
  });

  useEffect(() => {
    const {
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
      shouldKeepActiveProjectSelection,
    } = route;

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

    if (isNotesPath) {
      setActiveContext('notes');
      setActiveNoteId(noteId ?? '');
    } else if (isTicketsPath || !isNotesPath) {
      setActiveContext('issues');
      setActiveNoteId('');
    }

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
    const labelsChanged = !areStringArraysEqual(last.labels, urlLabels);
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
        search: urlSearch,
      };
      setFilters({
        labels: urlLabels,
        labelMode: urlLabelMode,
        cycleId: urlCycleId,
        labelId: urlLabelId,
        assigneeId: urlAssigneeId,
        status: urlStatus,
        priority: urlPriority,
        search: urlSearch,
      });
    }

    if (!ticketKey) {
      setActiveTicket(null);
    }
  }, [
    route,
    setActiveContext,
    setActiveNoteId,
    setActiveProjectId,
    setActiveSection,
    setActiveTicket,
    setActiveWorkspaceId,
    setFilters,
    setSidebarActiveScope,
  ]);

  useEffect(() => {
    if (!route.ticketKey) return;
    const normalizedRouteTicketKey = route.ticketKey.toUpperCase();
    if ((activeTicket?.key || '').toUpperCase() === normalizedRouteTicketKey) return;

    const resolved = routeScopedTicketByKey.get(normalizedRouteTicketKey) ?? null;
    setActiveTicket(resolved);
  }, [activeTicket?.key, route.ticketKey, routeScopedTicketByKey, setActiveTicket]);
}
