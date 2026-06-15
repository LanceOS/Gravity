import { QueryClient } from '@tanstack/react-query';

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
    staleTime: 60 * 1000,
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
};

export const queryKeys = {
  users: () => ['users'] as const,
  projects: (userId?: string) => ['projects', { userId }] as const,
  tickets: (projectId: string) => ['tickets', { projectId }] as const,
  ticket: (ticketKey: string, userId?: string) => ['tickets', 'detail', ticketKey, { userId }] as const,
  ticketRelations: (ticketKey: string, userId?: string) => ['tickets', 'relations', ticketKey, { userId }] as const,
  ticketDetails: () => ['ticket-detail'] as const,
  ticketDetail: (ticketId: string) => ['ticket-detail', ticketId] as const,
  comments: (ticketId: string) => ['comments', { ticketId }] as const,
  labels: (projectId: string) => ['labels', { projectId }] as const,
  cycles: (projectId: string) => ['cycles', { projectId }] as const,
  notes: (projectId: string) => ['notes', { projectId }] as const,
  note: (noteId: string) => ['notes', 'detail', noteId] as const,
  workspaceSettings: (workspaceId: string) => ['workspace', workspaceId, 'settings'] as const,
  workspaceMembers: (workspaceId: string) => ['workspace', workspaceId, 'members'] as const,
  workspaceInvites: (workspaceId: string) => ['workspace', workspaceId, 'invites'] as const,
  workspaceJoinRequests: (workspaceId: string) => ['workspace', workspaceId, 'joinRequests'] as const,
  workspaceSidebarTree: (workspaceId: string) => ['workspace', workspaceId, 'sidebar'] as const,
  mcpTools: (workspaceId: string) => ['ai', 'mcp', 'tools', { workspaceId }] as const,
  ollamaModels: (ollamaUrl: string) => ['ai', 'ollama', 'models', { ollamaUrl }] as const,
};
