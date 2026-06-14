import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../utils/queryClient';
import type { Ticket } from '../types/domain';

function mergeTicketRelationSnapshot(existing: Ticket | undefined, snapshot: Ticket) {
  if (!existing) {
    return snapshot;
  }

  return {
    ...existing,
    ...snapshot,
    blockedTicket: snapshot.blockedTicket ?? existing.blockedTicket ?? null,
    dependencies: snapshot.dependencies ?? existing.dependencies,
    blockers: snapshot.blockers ?? existing.blockers,
    relatedTicketIds: snapshot.relatedTicketIds ?? existing.relatedTicketIds,
  };
}

export function useTicketRelationsSnapshot(ticketKey?: string, userId?: string) {
  const queryClient = useQueryClient();
  const normalizedTicketKey = ticketKey?.trim().toUpperCase() ?? '';

  const relationSnapshotQuery = useQuery<Ticket | null>({
    queryKey: queryKeys.ticketRelations(normalizedTicketKey, userId),
    queryFn: () => apiClient.get<Ticket>(`/tickets/key/${normalizedTicketKey}`, { params: { include: 'relations' } }),
    enabled: !!normalizedTicketKey && !!userId,
    ...CACHE_CONFIGS.ticketDetail,
  });

  useEffect(() => {
    const snapshot = relationSnapshotQuery.data;
    if (!snapshot?.id) {
      return;
    }

    queryClient.setQueryData<Ticket>(queryKeys.ticketDetail(snapshot.id), (existing) => {
      return mergeTicketRelationSnapshot(existing, snapshot);
    });
  }, [queryClient, relationSnapshotQuery.data]);

  return relationSnapshotQuery;
}
