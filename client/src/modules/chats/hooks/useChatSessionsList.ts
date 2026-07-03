import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import {
  CHAT_SESSIONS_PAGE_SIZE,
  createChatSession,
  deleteChatSession,
  listChatSessions,
  renameChatSession,
} from '../utils/chatSessionsApi';
import type { ChatSession } from '../types/ChatSession';

const SEARCH_DEBOUNCE_MS = 300;

export function useChatSessionsList(projectId: string) {
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchValue.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  const query = useInfiniteQuery<ChatSession[]>({
    queryKey: queryKeys.chatSessions(projectId, debouncedSearch),
    queryFn: ({ pageParam }) =>
      listChatSessions(projectId, {
        limit: CHAT_SESSIONS_PAGE_SIZE,
        offset: (pageParam as number) || 0,
        search: debouncedSearch || undefined,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < CHAT_SESSIONS_PAGE_SIZE ? undefined : allPages.length * CHAT_SESSIONS_PAGE_SIZE,
    initialPageParam: 0,
    enabled: !!projectId,
    staleTime: CACHE_CONFIGS.chatSessions.staleTime,
    gcTime: CACHE_CONFIGS.chatSessions.gcTime,
  });

  const refreshSessions = () => {
    void queryClient.invalidateQueries({ queryKey: ['ai', 'chats', projectId] });
    void query.refetch();
  };

  const createMutation = useMutation({
    mutationFn: (title?: string) => createChatSession(projectId, title),
    onSuccess: refreshSessions,
  });

  const renameMutation = useMutation({
    mutationFn: ({ chatId, title }: { chatId: string; title: string }) => renameChatSession(projectId, chatId, title),
    onSuccess: refreshSessions,
  });

  const deleteMutation = useMutation({
    mutationFn: (chatId: string) => deleteChatSession(projectId, chatId),
    onSuccess: refreshSessions,
  });

  const sessions = query.data?.pages.flat() ?? [];

  return {
    sessions,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    searchValue,
    setSearchValue,
    createSession: createMutation.mutateAsync,
    isCreatingSession: createMutation.isPending,
    renameSession: (chatId: string, title: string) => renameMutation.mutate({ chatId, title }),
    deleteSession: (chatId: string) => deleteMutation.mutate(chatId),
    refreshSessions,
  };
}
