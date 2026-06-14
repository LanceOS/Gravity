import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../utils/queryClient';
import type { TicketWithRelations } from '../modules/tickets/utils/ticketRelations';
import { mergeTicketRelationSnapshot } from '../modules/tickets/utils/ticketRelations';

export function useTicketRelationsSnapshot(ticketKey?: string, userId?: string) {
  const queryClient = useQueryClient();
  const normalizedTicketKey = ticketKey?.trim().toUpperCase() ?? '';

  const relationSnapshotQuery = useQuery<TicketWithRelations | null>({
    queryKey: queryKeys.ticketRelations(normalizedTicketKey, userId),
    queryFn: () => apiClient.get<TicketWithRelations>(`/tickets/key/${normalizedTicketKey}`, { params: { include: 'relations' } }),
    enabled: !!normalizedTicketKey && !!userId,
    ...CACHE_CONFIGS.ticketDetail,
  });

  useEffect(() => {
    const snapshot = relationSnapshotQuery.data;
    if (!snapshot?.id) {
      return;
    }

    queryClient.setQueryData<TicketWithRelations>(queryKeys.ticketDetail(snapshot.id), (existing) => {
      return mergeTicketRelationSnapshot(existing, snapshot);
    });
  }, [queryClient, relationSnapshotQuery.data]);

  return relationSnapshotQuery;
}
