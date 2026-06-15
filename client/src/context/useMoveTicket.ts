import React, { useCallback } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { Ticket } from '../types/domain';
import { queryKeys } from '../utils/queryClient';
import type { TicketFiltersState } from './TicketContext';

type MoveTicketVariables = {
  id: string;
  sourceProjectId: string;
  targetProjectId: string;
};

type MoveTicketContext = {
  sourceTickets: Ticket[] | undefined;
  targetTickets: Ticket[] | undefined;
  previousActiveTicket: Ticket | null;
  previousActiveProjectId: string;
  optimisticTicket: Ticket | null;
  ticketKey: string;
  switchedProject: boolean;
};

interface UseMoveTicketArgs {
  queryClient: QueryClient;
  activeProjectIdRef: React.MutableRefObject<string>;
  activeTicketRef: React.MutableRefObject<Ticket | null>;
  setActiveProjectIdState: React.Dispatch<React.SetStateAction<string>>;
  setFiltersState: React.Dispatch<React.SetStateAction<TicketFiltersState>>;
  setActiveTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  invalidateAggregateTicketQueries?: (projectId?: string) => void;
}

const API_URL = '/api/v1';

export function useMoveTicket({
  queryClient,
  activeProjectIdRef,
  activeTicketRef,
  setActiveProjectIdState,
  setFiltersState,
  setActiveTicket,
  invalidateAggregateTicketQueries,
}: UseMoveTicketArgs) {
  const moveTicketMutation = useMutation({
    mutationFn: async ({ id, sourceProjectId, targetProjectId }: MoveTicketVariables) => {
      const response = await fetch(`${API_URL}/tickets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': sourceProjectId,
        },
        body: JSON.stringify({ projectId: targetProjectId }),
      });
      if (!response.ok) throw new Error('Failed to move ticket');
      return response.json() as Promise<Ticket>;
    },
    onMutate: async ({ id, sourceProjectId, targetProjectId }): Promise<MoveTicketContext> => {
      const sourceKey = queryKeys.tickets(sourceProjectId);
      const targetKey = queryKeys.tickets(targetProjectId);
      const sourceTickets = queryClient.getQueryData<Ticket[]>(sourceKey);
      const targetTickets = queryClient.getQueryData<Ticket[]>(targetKey);
      const currentTicket = sourceTickets?.find((ticket) => ticket.id === id) ?? (activeTicketRef.current?.id === id ? activeTicketRef.current : null);
      const optimisticTicket = currentTicket ? { ...currentTicket, projectId: targetProjectId } : null;
      const switchedProject = activeTicketRef.current?.id === id;
      const previousActiveTicket = activeTicketRef.current;
      const previousActiveProjectId = activeProjectIdRef.current;

      if (sourceTickets) {
        queryClient.setQueryData<Ticket[]>(sourceKey, (current) =>
          (current ?? sourceTickets).filter((ticket) => ticket.id !== id)
        );
      }

      if (optimisticTicket && targetTickets) {
        queryClient.setQueryData<Ticket[]>(targetKey, (current) => {
          const next = (current ?? targetTickets ?? []).filter((ticket) => ticket.id !== id);
          next.push(optimisticTicket);
          return next;
        });
      }

      if (switchedProject) {
        setActiveProjectIdState(targetProjectId);
        setFiltersState((prev) => ({ ...prev, projectId: targetProjectId }));
        setActiveTicket(optimisticTicket);
      }

      return {
        sourceTickets,
        targetTickets,
        previousActiveTicket,
        previousActiveProjectId,
        optimisticTicket,
        ticketKey: currentTicket?.key ?? '',
        switchedProject,
      };
    },
    onError: (error, { sourceProjectId, targetProjectId }, context) => {
      console.error('Error moving ticket on server, rolling back:', error);

      if (context?.sourceTickets) {
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(sourceProjectId), context.sourceTickets);
      }

      if (context?.targetTickets) {
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(targetProjectId), context.targetTickets);
      }

      if (context?.switchedProject) {
        setActiveProjectIdState(context.previousActiveProjectId);
        setFiltersState((prev) => ({ ...prev, projectId: context.previousActiveProjectId }));
        setActiveTicket(context.previousActiveTicket);
      }
    },
    onSuccess: (movedTicket, { targetProjectId }, context) => {
      const ticket = movedTicket ?? context?.optimisticTicket;
      if (ticket) {
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(targetProjectId), (current) => {
          const next = (current ?? []).filter((existing) => existing.id !== ticket.id);
          next.push(ticket);
          return next;
        });
      }

      if (context?.switchedProject && ticket) {
        setActiveTicket(ticket);
      }
    },
    onSettled: (movedTicket, error, { sourceProjectId, targetProjectId }, context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(sourceProjectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(targetProjectId) });

      invalidateAggregateTicketQueries?.(sourceProjectId);
      invalidateAggregateTicketQueries?.(targetProjectId);

      const ticketKey = context?.ticketKey || movedTicket?.key || '';
      if (ticketKey) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketKey) });
      }
    },
  });

  const moveTicket = useCallback(async (id: string, sourceProjectId: string, targetProjectId: string) => {
    if (!sourceProjectId || sourceProjectId === targetProjectId) {
      return false;
    }

    try {
      await moveTicketMutation.mutateAsync({
        id,
        sourceProjectId,
        targetProjectId,
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [moveTicketMutation]);

  return moveTicket;
}
