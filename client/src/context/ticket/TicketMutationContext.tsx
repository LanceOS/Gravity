import React, { createContext, useContext, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useTicketFilters } from '../filters/TicketFiltersContext';
import { useActiveTicket } from './ActiveTicketContext';
import { useMoveTicket } from '../utils/useMoveTicket';
import { removeSseTicketSubtree } from '../realtime/sseEventUtils';
import { queryKeys } from '../../utils/queryClient';
import { apiClient } from '../../utils/apiClient';
import {
  combineTicketDetails,
  findCachedTicketByKeyOrId,
  hasEquivalentTicketFields,
  invalidateAggregateTicketQueries,
  patchTicketInAllCaches,
  patchTicketInListById,
} from '../shared';
import { toast } from '@library';
import type { Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';
import type { 
  TicketMutationContextType, 
  CreateTicketInput, 
  TicketUpdateOptions 
} from './TicketMutationContext.types';
import { TICKET_UPDATE_DEBOUNCE_MS } from './ticketMutationUtils';
import { TicketUpdateBatchManager } from './TicketUpdateBatchManager';

export const TicketMutationContext = createContext<TicketMutationContextType | undefined>(undefined);

export const useOptionalTicketMutations = () => {
  const context = useContext(TicketMutationContext);
  return context;
};

export const useTicketMutations = () => {
  const context = useOptionalTicketMutations();
  if (!context) {
    throw new Error('useTicketMutations must be used within a TicketMutationProvider');
  }
  return context;
};

export const TicketMutationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { activeProjectIdRef, setActiveProjectId } = useActiveProject();
  const { setFilters } = useTicketFilters();
  const { activeTicket, setActiveTicket } = useActiveTicket();

  const activeTicketRef = useRef(activeTicket);
  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  const applyConfirmedTicketUpdate = useCallback((updatedTicket: Ticket) => {
    queryClient.setQueryData<TicketWithRelations>(queryKeys.ticketDetail(updatedTicket.id), (existing) => (
      existing ? combineTicketDetails(existing, updatedTicket) : (updatedTicket as TicketWithRelations)
    ));

    patchTicketInAllCaches(queryClient, updatedTicket.id, (existing) => combineTicketDetails(
      existing as TicketWithRelations,
      updatedTicket,
    ), {
      projectId: updatedTicket.projectId,
      ticketKey: updatedTicket.key,
    });

    invalidateAggregateTicketQueries(queryClient, updatedTicket.projectId);

    if (activeTicketRef.current?.id === updatedTicket.id) {
      setActiveTicket((prev) => {
        if (!prev) {
          return null;
        }

        const next = combineTicketDetails(prev as TicketWithRelations, updatedTicket);
        return hasEquivalentTicketFields(prev, next) ? prev : next;
      });
    }
  }, [queryClient, setActiveTicket]);

  const batchManagerRef = useRef<TicketUpdateBatchManager<Partial<Ticket>, Ticket | undefined, Ticket> | null>(null);
  // A child may save from its mount effect before this provider's effect runs.
  // Initialize lazily at the first queue operation as well as during setup.
  const getBatchManager = useCallback(() => {
    if (batchManagerRef.current) return batchManagerRef.current;
    const applyPendingUpdates = (id: string, updates: Partial<Ticket>) => {
      patchTicketInAllCaches(queryClient, id, (ticket) => ({ ...ticket, ...updates }));
      if (activeTicketRef.current?.id === id) {
        setActiveTicket((ticket) => ticket?.id === id ? { ...ticket, ...updates } : ticket);
      }
    };
    const batchManager = new TicketUpdateBatchManager<Partial<Ticket>, Ticket | undefined, Ticket>({
      debounceMs: TICKET_UPDATE_DEBOUNCE_MS,
      send: ({ id, updates, projectId }) => apiClient.patch<Ticket>(`/tickets/${id}`, updates, {
        headers: { 'X-Project-Id': projectId },
      }),
      getSnapshotAfterSuccess: (updatedTicket) => updatedTicket,
      onSuccess: (updatedTicket, batch, followUp) => {
        applyConfirmedTicketUpdate(updatedTicket);
        if (followUp) applyPendingUpdates(batch.id, followUp.updates);
        toast.show('Ticket saved.', 'success');
      },
      onError: (error, batch, followUp) => {
        console.error('Error updating ticket on server, rolling back:', error);
        toast.show('Unable to save ticket. Please try again.', 'error');
        if (batch.snapshot) applyConfirmedTicketUpdate(batch.snapshot);
        if (followUp) applyPendingUpdates(batch.id, followUp.updates);
      },
    });
    batchManagerRef.current = batchManager;
    return batchManager;
  }, [applyConfirmedTicketUpdate, queryClient, setActiveTicket]);

  useEffect(() => {
    const batchManager = getBatchManager();
    return () => {
      batchManager.dispose();
      batchManagerRef.current = null;
    };
  }, [getBatchManager]);

  const createTicketMutation = useMutation({
    mutationFn: async (ticketInput: CreateTicketInput) => apiClient.post<Ticket>('/tickets', ticketInput, {
      headers: { 'X-Project-Id': ticketInput.projectId },
    }),
    onSuccess: (createdTicket, ticketInput) => {
      const normalizedTicket: Ticket = {
        ...createdTicket,
      };

      if (ticketInput.projectId === activeProjectIdRef.current) {
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(activeProjectIdRef.current), (old) =>
          old ? [...old, normalizedTicket] : [normalizedTicket]
        );
      }
      invalidateAggregateTicketQueries(queryClient, ticketInput.projectId);
    },
  });

  const createTicket = useCallback(async (ticketInput: CreateTicketInput) => {
    try {
      return await createTicketMutation.mutateAsync(ticketInput);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [createTicketMutation]);

  const moveTicket = useMoveTicket({
    queryClient,
    activeProjectIdRef,
    activeTicketRef,
    setActiveProjectIdState: setActiveProjectId,
    setFilters,
    setActiveTicket,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, updates, projectId }: { id: string; updates: Partial<Ticket>; projectId: string }) => apiClient.patch<Ticket>(`/tickets/${id}`, updates, {
      headers: { 'X-Project-Id': projectId },
    }),
  });

  const updateTicket = useCallback(async (
    id: string,
    updates: Partial<Ticket>,
    options?: TicketUpdateOptions
  ) => {
    const cachedTicket = findCachedTicketByKeyOrId(queryClient, undefined, id, activeProjectIdRef.current);
    const projectId = cachedTicket?.projectId || activeProjectIdRef.current;
    if (!projectId) {
      toast.show('Select a project before saving this ticket.', 'error');
      return false;
    }

    if (updates.status) {
      updates = {
        ...updates,
      };
    }

    const shouldUpdateImmediately = options?.immediate !== false;

    if (shouldUpdateImmediately) {
      const ticketsQueryKey = queryKeys.tickets(projectId);
      const currentTickets = queryClient.getQueryData<Ticket[]>(ticketsQueryKey) || [];
      const wasActiveTicket = activeTicketRef.current?.id === id;
      const previousActiveTicket = wasActiveTicket ? activeTicketRef.current : null;
      const previousTickets = [...currentTickets];
      const optimisticUpdatedAt = new Date().toISOString();
      const optimisticPatch = {
        ...updates,
        updatedAt: optimisticUpdatedAt,
      };

      batchManagerRef.current?.cancel(id);

      queryClient.setQueryData<Ticket[]>(ticketsQueryKey, (old) => {
        const currentTickets = old ?? [];
        return patchTicketInListById(currentTickets, id, optimisticPatch) ?? currentTickets;
      });

      if (wasActiveTicket) {
        setActiveTicket((prev) => {
          if (!prev) {
            return null;
          }
          return hasEquivalentTicketFields(prev, { ...prev, ...optimisticPatch }) ? prev : { ...prev, ...optimisticPatch };
        });
      }

      return updateTicketMutation.mutateAsync({
        id,
        updates,
        projectId,
      }).then((updatedTicket) => {
        applyConfirmedTicketUpdate(updatedTicket);
        toast.show('Ticket saved.', 'success');
        return true;
      }).catch((error) => {
        console.error('Error updating ticket on server, rolling back:', error);
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(projectId), [...previousTickets]);

        if (wasActiveTicket && activeTicketRef.current?.id === id) {
          setActiveTicket(previousActiveTicket);
        }

        const message = error instanceof Error ? error.message : 'Failed to update ticket';
        if (toast?.show) {
          toast.show(`${message} Please try again.`, 'error');
        }
        return false;
      });

      return;
    }

    const ticketsQueryKey = queryKeys.tickets(projectId);
    const optimisticUpdatedAt = new Date().toISOString();
    const optimisticPatch = {
      ...updates,
      updatedAt: optimisticUpdatedAt,
    };

    // Optimistically update local query cache
    queryClient.setQueryData<Ticket[]>(ticketsQueryKey, (old) => {
      const currentTickets = old ?? [];
      return patchTicketInListById(currentTickets, id, optimisticPatch) ?? currentTickets;
    });

    // Also update active ticket if applicable
    if (activeTicketRef.current?.id === id) {
      setActiveTicket((prev) => {
        if (!prev) {
          return null;
        }

        const next = { ...prev, ...optimisticPatch };
        return hasEquivalentTicketFields(prev, next) ? prev : next;
      });
    }

    getBatchManager().queue({ id, projectId, updates, snapshot: cachedTicket });
  }, [activeProjectIdRef, applyConfirmedTicketUpdate, getBatchManager, queryClient, setActiveTicket, updateTicketMutation]);

  const deleteTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient.delete<{ deletedTickets?: Array<{ id: string; key: string; projectId: string }> }>(`/tickets/${id}`, {
        headers: { 'X-Project-Id': activeProjectIdRef.current },
        skipContentTypeHeader: true,
      });
    },
    onSuccess: (result) => {
      removeSseTicketSubtree(queryClient, result?.deletedTickets);
      if (result?.deletedTickets?.some(ticket => ticket.id === activeTicketRef.current?.id)) {
        setActiveTicket(null);
      }
    },
    onMutate: async (id) => {
      const projId = activeProjectIdRef.current;
      const queryKey = queryKeys.tickets(projId);
      const previousTickets = queryClient.getQueryData<Ticket[]>(queryKey);

      if (previousTickets) {
        queryClient.setQueryData<Ticket[]>(queryKey, (old) =>
          old ? old.filter((t) => t.id !== id) : []
        );
      }

      if (activeTicketRef.current?.id === id) {
        setActiveTicket(null);
      }

      return { previousTickets };
    },
    onError: (_err: unknown, _id: string, context: { previousTickets?: Ticket[] } | undefined) => {
      const projId = activeProjectIdRef.current;
      if (context?.previousTickets) {
        queryClient.setQueryData(queryKeys.tickets(projId), [...context.previousTickets]);
      }
    },
  });

  const deleteTicket = useCallback(async (id: string) => {
    await deleteTicketMutation.mutateAsync(id);
  }, [deleteTicketMutation]);

  const value = useMemo(
    () => ({
      createTicket,
      updateTicket,
      deleteTicket,
      moveTicket,
    }),
    [createTicket, updateTicket, deleteTicket, moveTicket]
  );

  return (
    <TicketMutationContext.Provider value={value}>
      {children}
    </TicketMutationContext.Provider>
  );
};
