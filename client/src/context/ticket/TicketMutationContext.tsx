import React, { createContext, useContext, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useTicketFilters } from '../filters/TicketFiltersContext';
import { useActiveTicket } from './ActiveTicketContext';
import { useMoveTicket } from '../utils/useMoveTicket';
import { queryKeys } from '../../utils/queryClient';
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
  TicketUpdateBatch, 
  InFlightTicketUpdateBatch, 
  TicketUpdateOptions 
} from './TicketMutationContext.types';
import { API_URL, TICKET_UPDATE_DEBOUNCE_MS } from './ticketMutationUtils';

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

  const pendingTicketUpdateBatchesRef = useRef(new Map<string, TicketUpdateBatch>());
  const inFlightTicketUpdateBatchesRef = useRef(new Map<string, InFlightTicketUpdateBatch>());

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

  useEffect(() => {
    return () => {
      for (const batch of pendingTicketUpdateBatchesRef.current.values()) {
        if (batch.timerId !== null) {
          window.clearTimeout(batch.timerId);
        }
      }
      pendingTicketUpdateBatchesRef.current.clear();
      inFlightTicketUpdateBatchesRef.current.clear();
    };
  }, []);

  const createTicketMutation = useMutation({
    mutationFn: async (ticketInput: CreateTicketInput) => {
      const response = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': ticketInput.projectId,
        },
        body: JSON.stringify(ticketInput),
      });
      if (!response.ok) throw new Error('Failed to create ticket');
      return response.json() as Promise<Ticket>;
    },
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
    mutationFn: async ({ id, updates, projectId }: { id: string; updates: Partial<Ticket>; projectId: string }) => {
      const response = await fetch(`${API_URL}/tickets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': projectId,
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update ticket');
      return response.json() as Promise<Ticket>;
    },
  });

  const flushPendingTicketUpdate = useCallback(async function flushPendingTicketUpdateInner(ticketId: string) {
    const pendingBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
    if (!pendingBatch) return;

    if (pendingBatch.timerId !== null) {
      window.clearTimeout(pendingBatch.timerId);
      pendingBatch.timerId = null;
    }

    if (inFlightTicketUpdateBatchesRef.current.has(ticketId)) {
      pendingBatch.flushRequested = true;
      return;
    }

    if (Object.keys(pendingBatch.updates).length === 0) {
      pendingTicketUpdateBatchesRef.current.delete(ticketId);
      return;
    }

    pendingTicketUpdateBatchesRef.current.delete(ticketId);
    inFlightTicketUpdateBatchesRef.current.set(ticketId, pendingBatch);

    try {
      const updatedTicket = await updateTicketMutation.mutateAsync({
        id: ticketId,
        updates: pendingBatch.updates,
        projectId: pendingBatch.projectId,
      });
      applyConfirmedTicketUpdate(updatedTicket);

      inFlightTicketUpdateBatchesRef.current.delete(ticketId);

      const followUpBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
      if (followUpBatch && followUpBatch.flushRequested) {
        followUpBatch.flushRequested = false;
        void flushPendingTicketUpdateInner(ticketId);
      }
    } catch (e) {
      console.error('Error updating ticket on server, rolling back:', e);
      inFlightTicketUpdateBatchesRef.current.delete(ticketId);

      // Rollback cache
      queryClient.setQueryData<Ticket[]>(queryKeys.tickets(pendingBatch.projectId), [...pendingBatch.originalTickets]);

      const followUpBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
      if (followUpBatch) {
        followUpBatch.originalTickets = pendingBatch.originalTickets;
        if (Object.keys(followUpBatch.updates).length > 0) {
          queryClient.setQueryData<Ticket[]>(queryKeys.tickets(pendingBatch.projectId), (old) => {
            const currentTickets = old ?? [];
            return patchTicketInListById(currentTickets, ticketId, followUpBatch.updates) ?? currentTickets;
          });
        }

        if (followUpBatch.flushRequested) {
          followUpBatch.flushRequested = false;
          void flushPendingTicketUpdateInner(ticketId);
        }
      }
    }
  }, [applyConfirmedTicketUpdate, queryClient, updateTicketMutation]);

  const updateTicket = useCallback(async (
    id: string,
    updates: Partial<Ticket>,
    options?: TicketUpdateOptions
  ) => {
    const cachedTicket = findCachedTicketByKeyOrId(queryClient, undefined, id, activeProjectIdRef.current);
    const projectId = cachedTicket?.projectId || activeProjectIdRef.current;
    if (!projectId) return;

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

      const pendingBatch = pendingTicketUpdateBatchesRef.current.get(id);
      if (pendingBatch && pendingBatch.timerId !== null) {
        window.clearTimeout(pendingBatch.timerId);
      }
      pendingTicketUpdateBatchesRef.current.delete(id);

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

      void updateTicketMutation.mutateAsync({
        id,
        updates,
        projectId,
      }).then((updatedTicket) => {
        applyConfirmedTicketUpdate(updatedTicket);
      }).catch((error) => {
        console.error('Error updating ticket on server, rolling back:', error);
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(projectId), [...previousTickets]);

        if (wasActiveTicket && activeTicketRef.current?.id === id) {
          setActiveTicket(previousActiveTicket);
        }

        const message = error instanceof Error ? error.message : 'Failed to update ticket';
        if (toast?.show) {
          toast.show(message, 'error');
        }
      });

      return;
    }

    const pendingBatch = pendingTicketUpdateBatchesRef.current.get(id);
    const ticketsQueryKey = queryKeys.tickets(projectId);
    const currentTickets = queryClient.getQueryData<Ticket[]>(ticketsQueryKey) || [];

    if (!pendingBatch) {
      pendingTicketUpdateBatchesRef.current.set(id, {
        originalTickets: [...currentTickets],
        projectId,
        updates: {},
        timerId: null,
        flushRequested: false,
      });
    }

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

    const nextBatch = pendingTicketUpdateBatchesRef.current.get(id);
    if (!nextBatch) return;

    nextBatch.projectId = projectId;
    nextBatch.updates = { ...nextBatch.updates, ...updates };
    nextBatch.flushRequested = false;

    if (nextBatch.timerId !== null) {
      window.clearTimeout(nextBatch.timerId);
    }

    nextBatch.timerId = window.setTimeout(() => {
      void flushPendingTicketUpdate(id);
    }, TICKET_UPDATE_DEBOUNCE_MS);
  }, [activeProjectIdRef, applyConfirmedTicketUpdate, flushPendingTicketUpdate, queryClient, setActiveTicket, updateTicketMutation]);

  const deleteTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_URL}/tickets/${id}`, {
        method: 'DELETE',
        headers: { 'X-Project-Id': activeProjectIdRef.current },
      });
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
