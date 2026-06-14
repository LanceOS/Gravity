import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/queryClient';
import type { NoteMetadata } from '../types';

export function useNotes(projectId: string, sortDirection: 'desc' | 'asc' = 'desc') {
  const limit = 20;

  const query = useInfiniteQuery<NoteMetadata[]>({
    queryKey: [...queryKeys.notes(projectId), sortDirection],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/v1/notes?limit=${limit}&offset=${pageParam}&sort=${sortDirection}`, {
        headers: {
          'x-project-id': projectId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load notes');
      }

      return response.json();
    },
    initialPageParam: 0,
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
