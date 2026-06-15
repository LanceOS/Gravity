import { useInfiniteQuery } from '@tanstack/react-query';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import { apiClient } from '../../../utils/apiClient';
import type { NoteMetadata } from '../types';

export function useNotes(projectId: string, sortDirection: 'desc' | 'asc' = 'desc') {
  const limit = 20;

  const query = useInfiniteQuery<NoteMetadata[]>({
    queryKey: [...queryKeys.notes(projectId), sortDirection],
    queryFn: async ({ pageParam = 0 }) => {
      return apiClient.get<NoteMetadata[]>('/notes', {
        projectId,
        params: {
          limit: `${limit}`,
          offset: `${pageParam}`,
          sort: sortDirection,
        },
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

  const notes = query.data ? query.data.pages.flat() : [];

  return {
    notes,
    loading: query.isLoading || query.isFetchingNextPage || query.isFetching,
    error: query.error ? (query.error as Error).message : null,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
  };
}
