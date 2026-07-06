import { QueryClient } from '@tanstack/react-query';

type MutableQueryKey = unknown[];

const toMutableQueryKey = <T extends MutableQueryKey>(queryKey: T): MutableQueryKey => [...queryKey];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const CACHE_CONFIGS = {
  ticketsList: {
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  },
  ticketDetail: {
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60 * 1000,
  },
  workspaceMembers: {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  },
  workspaceSettings: {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  },
  workspaceInvites: {
    staleTime: 60 * 1000,
    gcTime: 15 * 60 * 1000,
  },
  workspaceJoinRequests: {
    staleTime: 60 * 1000,
    gcTime: 15 * 60 * 1000,
  },
  metadata: {
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  },
  workspaceSidebar: {
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  },
  aiTools: {
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  },
  aiModels: {
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  },
  chatSessions: {
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
  },
};

export const queryKeys = {
  users: (scope?: { projectId?: string; workspaceId?: string; teamId?: string }) => (
    scope ? toMutableQueryKey(['users', scope]) : toMutableQueryKey(['users'])
  ),
  projects: (userId?: string) => toMutableQueryKey(['projects', { userId }]),
  tickets: (projectId: string) => toMutableQueryKey(['tickets', { projectId }]),
  ticket: (ticketKey: string, userId?: string) => toMutableQueryKey(['tickets', 'detail', ticketKey, { userId }]),
  ticketRelations: (ticketKey: string, userId?: string) => toMutableQueryKey(['tickets', 'relations', ticketKey, { userId }]),
  ticketDetails: () => toMutableQueryKey(['ticket-detail']),
  ticketDetail: (ticketId: string) => toMutableQueryKey(['ticket-detail', ticketId]),
  comments: (ticketId: string) => toMutableQueryKey(['comments', { ticketId }]),
  labels: (projectId: string) => toMutableQueryKey(['labels', { projectId }]),
  cycles: (projectId: string) => toMutableQueryKey(['cycles', { projectId }]),
  notes: (projectId: string) => toMutableQueryKey(['notes', { projectId }]),
  note: (noteId: string, projectId?: string) => toMutableQueryKey(['notes', 'detail', noteId, { projectId }]),
  workspaceSettings: (workspaceId: string) => toMutableQueryKey(['workspace', workspaceId, 'settings']),
  workspaceMembers: (workspaceId: string) => toMutableQueryKey(['workspace', workspaceId, 'members']),
  workspaceInvites: (workspaceId: string) => toMutableQueryKey(['workspace', workspaceId, 'invites']),
  workspaceJoinRequests: (workspaceId: string) => toMutableQueryKey(['workspace', workspaceId, 'joinRequests']),
  workspaceSidebarTree: (workspaceId: string) => toMutableQueryKey(['workspace', workspaceId, 'sidebar']),
  mcpTools: (workspaceId: string) => toMutableQueryKey(['ai', 'mcp', 'tools', { workspaceId }]),
  chatSessions: (projectId: string, search = '') => toMutableQueryKey(['ai', 'chats', projectId, { search }]),
};
