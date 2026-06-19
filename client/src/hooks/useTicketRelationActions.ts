import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import { toast } from '@library';
import { apiClient } from '../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../utils/queryClient';
import type { Ticket } from '../types/domain';
import {
  fallbackTicketRelation,
  isDuplicateTicketRelationError,
  patchTicketRelation,
  toTicketRelation,
  type TicketRelationKey,
  type TicketWithRelations,
} from '../modules/tickets/utils/ticketRelations';

type TicketRelationMutationContext = {
  ticketDetailKey: ReturnType<typeof queryKeys.ticketDetail>;
  relatedDetailKey: ReturnType<typeof queryKeys.ticketDetail>;
  previousTicketDetail: TicketWithRelations | undefined;
  previousRelatedDetail: TicketWithRelations | undefined;
  hadTicketDetail: boolean;
  hadRelatedDetail: boolean;
};

interface UseTicketRelationActionsArgs {
  queryClient: QueryClient;
  tickets: Ticket[];
  activeTicket: Ticket | null;
  activeTicketId?: string;
  activeTicketProjectId: string;
  isAuthenticated: boolean;
}

export function useTicketRelationActions({
  queryClient,
  tickets,
  activeTicket,
  activeTicketId,
  activeTicketProjectId,
  isAuthenticated,
}: UseTicketRelationActionsArgs) {
  const activeTicketRef = useRef<Ticket | null>(activeTicket);
  const pendingTicketRelationAddsRef = useRef(new Set<string>());

  const cachedTicketsById = useMemo(() => {
    const byId = new Map<string, Ticket>();
    for (const ticket of tickets) {
      byId.set(ticket.id, ticket);
    }

    if (activeTicket) {
      byId.set(activeTicket.id, activeTicket);
    }

    return byId;
  }, [activeTicket, tickets]);

  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  useEffect(() => {
    return () => {
      pendingTicketRelationAddsRef.current.clear();
    };
  }, []);

  const previousActiveTicketDetailRef = useRef<TicketWithRelations | null>(null);

  // Active Ticket Detail (includes dependency and blocker relations)
  const activeTicketDetailQuery = useQuery<TicketWithRelations | null>({
    queryKey: queryKeys.ticketDetail(activeTicketId || ''),
    queryFn: () => apiClient.get<TicketWithRelations>(`/tickets/${activeTicketId}`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && isAuthenticated,
    ...CACHE_CONFIGS.ticketDetail,
  });
  useEffect(() => {
    if (activeTicketDetailQuery.data) {
      previousActiveTicketDetailRef.current = activeTicketDetailQuery.data;
    }
  }, [activeTicketDetailQuery.data]);
  const activeTicketDetail = activeTicketDetailQuery.data ?? previousActiveTicketDetailRef.current ?? null;

  const getTicketProjectIdForMutation = useCallback((ticketId: string) => {
    const cachedTicket = cachedTicketsById.get(ticketId);
    if (cachedTicket) {
      return cachedTicket.projectId;
    }

    const detailTicket = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId));
    return detailTicket?.projectId;
  }, [cachedTicketsById, queryClient]);

  const findTicketInCache = useCallback((ticketId: string): Ticket | undefined => {
    if (cachedTicketsById.has(ticketId)) {
      return cachedTicketsById.get(ticketId);
    }

    const cachedDetailFromKey = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId));
    if (cachedDetailFromKey) {
      return cachedDetailFromKey;
    }

    if (activeTicketRef.current?.id === ticketId) {
      return activeTicketRef.current;
    }

    const ticketDetails = queryClient.getQueriesData<TicketWithRelations>({ queryKey: queryKeys.ticketDetails() });
    for (const [, cachedTicket] of ticketDetails) {
      if (cachedTicket?.id === ticketId) {
        return cachedTicket;
      }
    }

    return undefined;
  }, [cachedTicketsById, queryClient]);

  const getCachedTicketRelation = useCallback((ticketId: string) => {
    const cachedTicket = findTicketInCache(ticketId);
    return cachedTicket ? toTicketRelation(cachedTicket) : fallbackTicketRelation(ticketId);
  }, [findTicketInCache]);

  const hasCachedTicketRelation = useCallback((ticketId: string, relationKey: TicketRelationKey, relatedTicketId: string) => {
    const cachedDetail = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId));
    return Boolean(cachedDetail?.[relationKey]?.some((relation) => relation.id === relatedTicketId));
  }, [queryClient]);

  const isPendingTicketRelationAdd = useCallback((ticketId: string, relationKey: TicketRelationKey, relatedTicketId: string) => {
    return pendingTicketRelationAddsRef.current.has(`${ticketId}:${relationKey}:${relatedTicketId}`);
  }, []);

  const markPendingTicketRelationAdd = useCallback((ticketId: string, relationKey: TicketRelationKey, relatedTicketId: string) => {
    pendingTicketRelationAddsRef.current.add(`${ticketId}:${relationKey}:${relatedTicketId}`);
  }, []);

  const clearPendingTicketRelationAdd = useCallback((ticketId: string, relationKey: TicketRelationKey, relatedTicketId: string) => {
    pendingTicketRelationAddsRef.current.delete(`${ticketId}:${relationKey}:${relatedTicketId}`);
  }, []);

  const restoreTicketDetailSnapshot = useCallback((
    queryKey: ReturnType<typeof queryKeys.ticketDetail>,
    hadSnapshot: boolean,
    snapshot: TicketWithRelations | undefined
  ) => {
    if (hadSnapshot && snapshot) {
      queryClient.setQueryData<TicketWithRelations>(queryKey, snapshot);
      return;
    }

    queryClient.removeQueries({ queryKey, exact: true });
  }, [queryClient]);

  const handleTicketRelationMutationError = useCallback((context: TicketRelationMutationContext | undefined, message: string, shouldRollback = true) => {
    if (!shouldRollback) {
      return;
    }

    if (context) {
      restoreTicketDetailSnapshot(context.ticketDetailKey, context.hadTicketDetail, context.previousTicketDetail);
      restoreTicketDetailSnapshot(context.relatedDetailKey, context.hadRelatedDetail, context.previousRelatedDetail);
    }

    if (toast?.show) {
      toast.show(message, 'error');
    }
  }, [restoreTicketDetailSnapshot]);

  const optimisticallyPatchTicketRelation = useCallback(async ({
    ticketId,
    relatedTicketId,
    relationKey,
    reciprocalRelationKey,
    action,
  }: {
    ticketId: string;
    relatedTicketId: string;
    relationKey: TicketRelationKey;
    reciprocalRelationKey: TicketRelationKey;
    action: 'add' | 'remove';
  }): Promise<TicketRelationMutationContext> => {
    const ticketDetailKey = queryKeys.ticketDetail(ticketId);
    const relatedDetailKey = queryKeys.ticketDetail(relatedTicketId);

    await Promise.all([
      queryClient.cancelQueries({ queryKey: ticketDetailKey }),
      queryClient.cancelQueries({ queryKey: relatedDetailKey }),
    ]);

    const previousTicketDetail = queryClient.getQueryData<TicketWithRelations>(ticketDetailKey);
    const previousRelatedDetail = queryClient.getQueryData<TicketWithRelations>(relatedDetailKey);
    const ticketDetail = previousTicketDetail ?? findTicketInCache(ticketId);
    const relatedDetail = previousRelatedDetail ?? findTicketInCache(relatedTicketId);
    const relatedTicket = getCachedTicketRelation(relatedTicketId);
    const ticketRelation = getCachedTicketRelation(ticketId);

    if (ticketDetail) {
      const optimisticTicket = patchTicketRelation(ticketDetail, relationKey, relatedTicket, action);
      queryClient.setQueryData<TicketWithRelations>(
        ticketDetailKey,
        {
          ...optimisticTicket,
          updatedAt: new Date().toISOString(),
        }
      );
    }

    if (relatedDetail) {
      const optimisticRelatedTicket = patchTicketRelation(relatedDetail, reciprocalRelationKey, ticketRelation, action);
      queryClient.setQueryData<TicketWithRelations>(
        relatedDetailKey,
        {
          ...optimisticRelatedTicket,
          updatedAt: new Date().toISOString(),
        }
      );
    }

    return {
      ticketDetailKey,
      relatedDetailKey,
      previousTicketDetail,
      previousRelatedDetail,
      hadTicketDetail: previousTicketDetail !== undefined,
      hadRelatedDetail: previousRelatedDetail !== undefined,
    };
  }, [findTicketInCache, getCachedTicketRelation, queryClient]);

  const addTicketDependencyMutation = useMutation({
    mutationFn: async ({ ticketId, dependencyId, projectId }: { ticketId: string; dependencyId: string; projectId?: string }) => {
      return apiClient.post<{ success: boolean }>(`/tickets/${ticketId}/dependencies`, { dependencyId }, { projectId });
    },
    onMutate: ({ ticketId, dependencyId }) => optimisticallyPatchTicketRelation({
      ticketId,
      relatedTicketId: dependencyId,
      relationKey: 'dependencies',
      reciprocalRelationKey: 'blockers',
      action: 'add',
    }),
    onError: (error, _variables, context) => {
      handleTicketRelationMutationError(context, 'Failed to add dependency', !isDuplicateTicketRelationError(error));
    },
    onSettled: (_data, _err, { ticketId, dependencyId }) => {
      clearPendingTicketRelationAdd(ticketId, 'dependencies', dependencyId);
    },
  });

  const addTicketDependency = useCallback(async (ticketId: string, dependencyId: string) => {
    try {
      if (hasCachedTicketRelation(ticketId, 'dependencies', dependencyId)) {
        return true;
      }

      const projectId = getTicketProjectIdForMutation(ticketId);
      markPendingTicketRelationAdd(ticketId, 'dependencies', dependencyId);
      await addTicketDependencyMutation.mutateAsync({ ticketId, dependencyId, projectId });
      return true;
    } catch (e) {
      console.error(e);
      if (e instanceof Error && toast?.show) {
        toast.show(e.message, 'error');
      }
      return false;
    }
  }, [addTicketDependencyMutation, getTicketProjectIdForMutation, hasCachedTicketRelation, markPendingTicketRelationAdd]);

  const removeTicketDependencyMutation = useMutation({
    mutationFn: async ({ ticketId, dependencyId, projectId }: { ticketId: string; dependencyId: string; projectId?: string }) => {
      return apiClient.delete<{ success: boolean }>(`/tickets/${ticketId}/dependencies/${dependencyId}`, { projectId });
    },
    onMutate: ({ ticketId, dependencyId }) => optimisticallyPatchTicketRelation({
      ticketId,
      relatedTicketId: dependencyId,
      relationKey: 'dependencies',
      reciprocalRelationKey: 'blockers',
      action: 'remove',
    }),
    onError: (_err, _variables, context) => {
      handleTicketRelationMutationError(context, 'Failed to remove dependency');
    },
    onSettled: (_data, _err, { ticketId, dependencyId }) => {
      clearPendingTicketRelationAdd(ticketId, 'dependencies', dependencyId);
    },
  });

  const removeTicketDependency = useCallback(async (ticketId: string, dependencyId: string) => {
    try {
      if (isPendingTicketRelationAdd(ticketId, 'dependencies', dependencyId)) {
        return true;
      }

      if (!hasCachedTicketRelation(ticketId, 'dependencies', dependencyId)) {
        return true;
      }

      const projectId = getTicketProjectIdForMutation(ticketId);
      await removeTicketDependencyMutation.mutateAsync({ ticketId, dependencyId, projectId });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [getTicketProjectIdForMutation, hasCachedTicketRelation, isPendingTicketRelationAdd, removeTicketDependencyMutation]);

  const addTicketBlockerMutation = useMutation({
    mutationFn: async ({ ticketId, blockerId, projectId }: { ticketId: string; blockerId: string; projectId?: string }) => {
      return apiClient.post<{ success: boolean }>(`/tickets/${ticketId}/blockers`, { blockerId }, { projectId });
    },
    onMutate: ({ ticketId, blockerId }) => optimisticallyPatchTicketRelation({
      ticketId,
      relatedTicketId: blockerId,
      relationKey: 'blockers',
      reciprocalRelationKey: 'dependencies',
      action: 'add',
    }),
    onError: (error, _variables, context) => {
      handleTicketRelationMutationError(context, 'Failed to add blocker', !isDuplicateTicketRelationError(error));
    },
    onSettled: (_data, _err, { ticketId, blockerId }) => {
      clearPendingTicketRelationAdd(ticketId, 'blockers', blockerId);
    },
  });

  const addTicketBlocker = useCallback(async (ticketId: string, blockerId: string) => {
    try {
      if (hasCachedTicketRelation(ticketId, 'blockers', blockerId)) {
        return true;
      }

      const projectId = getTicketProjectIdForMutation(ticketId);
      markPendingTicketRelationAdd(ticketId, 'blockers', blockerId);
      await addTicketBlockerMutation.mutateAsync({ ticketId, blockerId, projectId });
      return true;
    } catch (e) {
      console.error(e);
      if (e instanceof Error && toast?.show) {
        toast.show(e.message, 'error');
      }
      return false;
    }
  }, [addTicketBlockerMutation, getTicketProjectIdForMutation, hasCachedTicketRelation, markPendingTicketRelationAdd]);

  const removeTicketBlockerMutation = useMutation({
    mutationFn: async ({ ticketId, blockerId, projectId }: { ticketId: string; blockerId: string; projectId?: string }) => {
      return apiClient.delete<{ success: boolean }>(`/tickets/${ticketId}/blockers/${blockerId}`, { projectId });
    },
    onMutate: ({ ticketId, blockerId }) => optimisticallyPatchTicketRelation({
      ticketId,
      relatedTicketId: blockerId,
      relationKey: 'blockers',
      reciprocalRelationKey: 'dependencies',
      action: 'remove',
    }),
    onError: (_err, _variables, context) => {
      handleTicketRelationMutationError(context, 'Failed to remove blocker');
    },
    onSettled: (_data, _err, { ticketId, blockerId }) => {
      clearPendingTicketRelationAdd(ticketId, 'blockers', blockerId);
    },
  });

  const removeTicketBlocker = useCallback(async (ticketId: string, blockerId: string) => {
    try {
      if (isPendingTicketRelationAdd(ticketId, 'blockers', blockerId)) {
        return true;
      }

      if (!hasCachedTicketRelation(ticketId, 'blockers', blockerId)) {
        return true;
      }

      const projectId = getTicketProjectIdForMutation(ticketId);
      await removeTicketBlockerMutation.mutateAsync({ ticketId, blockerId, projectId });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [getTicketProjectIdForMutation, hasCachedTicketRelation, isPendingTicketRelationAdd, removeTicketBlockerMutation]);

  return {
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  };
}
