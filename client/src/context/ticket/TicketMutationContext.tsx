import React, { createContext, useContext, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useTicketFilters } from '../filters/TicketFiltersContext';
import { useActiveTicket } from './ActiveTicketContext';
import { useMoveTicket } from '../utils/useMoveTicket';
import { isTicketDeletedInSession, removeSseTicketSubtree } from '../realtime/sseEventUtils';
import { queryKeys } from '../../utils/queryClient';
import { apiClient } from '../../utils/apiClient';
import {
  combineTicketDetails,
  findCachedTicketByKeyOrId,
  hasEquivalentTicketFields,
  invalidateAggregateTicketQueries,
  patchTicketInAllCaches,
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

  const applyConfirmedTicketUpdate = useCallback((updatedTicket: Ticket, pending: () => Partial<Ticket>) => {
    if (isTicketDeletedInSession(queryClient, updatedTicket.id)) return;
    queryClient.setQueryData<TicketWithRelations>(queryKeys.ticketDetail(updatedTicket.id), (existing) => (
      { ...(existing ? combineTicketDetails(existing, updatedTicket) : updatedTicket), ...pending() } as TicketWithRelations
    ));

    patchTicketInAllCaches(queryClient, updatedTicket.id, (existing) => ({
      ...combineTicketDetails(existing as TicketWithRelations, updatedTicket), ...pending(),
    }), {
      projectId: updatedTicket.projectId,
      ticketKey: updatedTicket.key,
    });

    invalidateAggregateTicketQueries(queryClient, updatedTicket.projectId);

    if (activeTicketRef.current?.id === updatedTicket.id) {
      const pendingUpdates = pending();
      setActiveTicket((prev) => {
        if (!prev || prev.id !== updatedTicket.id) {
          return prev;
        }

        const next = { ...combineTicketDetails(prev as TicketWithRelations, updatedTicket), ...pendingUpdates };
        return hasEquivalentTicketFields(prev, next) ? prev : next;
      });
    }
  }, [queryClient, setActiveTicket]);

  const batchManagerRef = useRef<TicketUpdateBatchManager<Partial<Ticket>, Ticket | undefined, Ticket> | null>(null);
  // A child may save from its mount effect before this provider's effect runs.
  // Initialize lazily at the first queue operation as well as during setup.
  const getBatchManager = useCallback(() => {
    if (batchManagerRef.current) return batchManagerRef.current;
    const applyPendingUpdates = (id: string, updates: Partial<Ticket>, projectId: string, ticketKey?: string) => {
      const patch = () => ({ ...updates, ...batchManager.getPendingUpdates(id) });
      patchTicketInAllCaches(queryClient, id, (ticket) => ({ ...ticket, ...patch() }), { projectId, ticketKey });
      if (activeTicketRef.current?.id === id) {
        const activePatch = patch();
        setActiveTicket((ticket) => ticket?.id === id ? { ...ticket, ...activePatch } : ticket);
      }
    };
    const batchManager = new TicketUpdateBatchManager<Partial<Ticket>, Ticket | undefined, Ticket>({
      debounceMs: TICKET_UPDATE_DEBOUNCE_MS,
      send: ({ id, updates, projectId }) => {
        if (isTicketDeletedInSession(queryClient, id)) return Promise.reject(new Error('Ticket was deleted.'));
        return apiClient.patch<Ticket>(`/tickets/${id}`, updates, {
          headers: { 'X-Project-Id': projectId },
        });
      },
      getSnapshotAfterSuccess: (updatedTicket) => updatedTicket,
      onSuccess: (updatedTicket, batch) => {
        if (isTicketDeletedInSession(queryClient, batch.id)) return;
        applyConfirmedTicketUpdate(updatedTicket, () => batchManager.getPendingUpdates(batch.id));
        toast.show('Ticket saved.', 'success');
      },
      onError: (error, batch) => {
        if (isTicketDeletedInSession(queryClient, batch.id)) return;
        console.error('Error updating ticket on server, rolling back:', error);
        const message = error instanceof Error ? error.message : 'Failed to update ticket';
        if (batch.snapshot) {
          // Restore only fields owned by the failed batch; other local/realtime
          // changes on this ticket and saves on other tickets remain intact.
          const rollback = Object.fromEntries(
            [...Object.keys(batch.updates), 'updatedAt'].map(key => [key, batch.snapshot![key as keyof Ticket]]),
          ) as Partial<Ticket>;
          applyPendingUpdates(batch.id, rollback, batch.projectId, batch.snapshot.key);
        }
        toast.show(`${message} Please try again.`, 'error');
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

  const updateTicket = useCallback(async (
    id: string,
    updates: Partial<Ticket>,
    options?: TicketUpdateOptions
  ) => {
    if (isTicketDeletedInSession(queryClient, id)) return false;
    const cachedTicket = findCachedTicketByKeyOrId(queryClient, undefined, id, activeProjectIdRef.current);
    const projectId = cachedTicket?.projectId || activeProjectIdRef.current;
    if (!projectId) {
      toast.show('Select a project before saving this ticket.', 'error');
      return false;
    }

    if (Object.keys(updates).length === 0) return options?.immediate !== false ? true : undefined;
    // Register before notifying cache subscribers so reentrant edits stay newer.
    const manager = getBatchManager();
    const saved = manager.queue({ id, projectId, updates, snapshot: cachedTicket });
    const optimisticPatch = () => ({ ...updates, updatedAt: new Date().toISOString(), ...manager.getOptimisticUpdates(id) });
    patchTicketInAllCaches(queryClient, id, (ticket) => ({ ...ticket, ...optimisticPatch() }), { projectId, ticketKey: cachedTicket?.key });

    // Also update active ticket if applicable
    if (activeTicketRef.current?.id === id) {
      const activePatch = optimisticPatch();
      setActiveTicket((prev) => {
        if (!prev || prev.id !== id) {
          return prev;
        }

        const next = { ...prev, ...activePatch };
        return hasEquivalentTicketFields(prev, next) ? prev : next;
      });
    }

    if (options?.immediate !== false) {
      // Flush through the same per-ticket queue, retaining pending fields and
      // waiting for this batch's outcome (not an older or later request).
      void manager.flush(id).catch(() => {});
      return await saved && !isTicketDeletedInSession(queryClient, id);
    }
  }, [activeProjectIdRef, getBatchManager, queryClient, setActiveTicket]);

  const deleteTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient.delete<{ deletedTickets?: Array<{ id: string; key: string; projectId: string }> }>(`/tickets/${id}`, {
        headers: { 'X-Project-Id': activeProjectIdRef.current },
        skipContentTypeHeader: true,
      });
    },
    onSuccess: (result) => {
      removeSseTicketSubtree(queryClient, result?.deletedTickets);
      for (const ticket of result?.deletedTickets ?? []) batchManagerRef.current?.cancel(ticket.id);
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
        queryClient.setQueryData(queryKeys.tickets(projId), context.previousTickets.filter(ticket => !isTicketDeletedInSession(queryClient, ticket.id)));
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
