import { useCallback } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

interface UseQueryCacheStringArgs {
  key: QueryKey | null;
}

export interface UseQueryCacheStringResult {
  readValue: () => string | null;
  writeValue: (value: string | null) => void;
}

export function useQueryCacheString({ key }: UseQueryCacheStringArgs): UseQueryCacheStringResult {
  const queryClient = useQueryClient();

  const readValue = useCallback(() => {
    if (!key) {
      return null;
    }

    return queryClient.getQueryData<string>(key) ?? null;
  }, [key, queryClient]);

  const writeValue = useCallback((value: string | null) => {
    if (!key) {
      return;
    }

    queryClient.setQueryData<string | null>(key, value);
  }, [key, queryClient]);

  return { readValue, writeValue };
}

