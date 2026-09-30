import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import type { NoteMetadata } from '../types';
import { notesService, type NotesService } from '../services/notesService';

interface UseNotesOptions {
  notesService?: NotesService;
}

export function useNotes(projectId: string, sortDirection: 'desc' | 'asc' = 'desc', { notesService: clientNotesService = notesService }: UseNotesOptions = {}) {
  const limit = 20;


  const query = useInfiniteQuery<NoteMetadata[]>({
    queryKey: [...queryKeys.notes(projectId), sortDirection],
    queryFn: async ({ pageParam = 0 }) => {
      if (!projectId) {
        return [];
      }

      return clientNotesService.listNotes(projectId, {
        limit,
        offset: typeof pageParam === 'number' ? pageParam : 0,
        sort: sortDirection,
      });
    },

    initialPageParam: 0,
    staleTime: CACHE_CONFIGS.metadata.staleTime,
    gcTime: CACHE_CONFIGS.metadata.gcTime,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < limit) return undefined;
      return allPages.length * limit;
    },
    enabled: !!projectId,
  });

  const notes = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return Promise.resolve();
    }

    return fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    notes,
    loading: query.isLoading || query.isFetchingNextPage || query.isFetching,
    error: query.isError ? 'Failed to load notes' : null,
    hasMore: query.hasNextPage,
    loadMore,
  };
}
