import React, { useCallback } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { Ticket } from '../../types/domain';
import { queryKeys } from '../../utils/queryClient';
import type { TicketFiltersState } from '../TicketContextContext';

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

function isEquivalentTicket(left: Ticket, right: Ticket) {
  return left.id === right.id &&
    left.key === right.key &&
    left.title === right.title &&
    left.description === right.description &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.projectId === right.projectId &&
    left.assigneeId === right.assigneeId &&
    left.cycleId === right.cycleId &&
    left.parentId === right.parentId &&
    left.isBlocked === right.isBlocked &&
    left.isDependency === right.isDependency &&
    left.prStatus === right.prStatus &&
    left.prUrl === right.prUrl &&
    left.branchName === right.branchName &&
    left.updatedAt === right.updatedAt;
}

function upsertTicketInList(list: readonly Ticket[] | undefined, ticket: Ticket) {
  const next = (list ?? []);
  const ticketIndex = next.findIndex((item) => item.id === ticket.id);

  if (ticketIndex === -1) {
    return [...next, ticket];
  }

  const existing = next[ticketIndex];
  if (isEquivalentTicket(existing, ticket)) {
    return [...next];
  }

  const updated = [...next];
  updated[ticketIndex] = {
    ...existing,
    ...ticket,
  };

  return updated;
}

function removeTicketFromList(list: readonly Ticket[] | undefined, ticketId: string) {
  if (!list) {
    return [];
  }

  const next = list.filter((ticket) => ticket.id !== ticketId);
  return next.length === list.length ? [...list] : next;
}

interface UseMoveTicketArgs {
  queryClient: QueryClient;
  activeProjectIdRef: React.MutableRefObject<string>;
  activeTicketRef: React.MutableRefObject<Ticket | null>;
  setActiveProjectIdState: (id: string) => void;
  setFiltersState: React.Dispatch<React.SetStateAction<TicketFiltersState>>;
  setActiveTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
}

const API_URL = '/api/v1';

export function useMoveTicket({
  queryClient,
  activeProjectIdRef,
  activeTicketRef,
  setActiveProjectIdState,
  setFiltersState,
  setActiveTicket,
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
      const normalizedSourceTickets = sourceTickets ? [...sourceTickets] : undefined;
      const normalizedTargetTickets = targetTickets ? [...targetTickets] : undefined;
      const currentTicket = sourceTickets?.find((ticket) => ticket.id === id) ?? (activeTicketRef.current?.id === id ? activeTicketRef.current : null);
      const optimisticTicket = currentTicket
        ? { ...currentTicket, projectId: targetProjectId, updatedAt: new Date().toISOString() }
        : null;
      const switchedProject = activeTicketRef.current?.id === id;
      const previousActiveTicket = activeTicketRef.current;
      const previousActiveProjectId = activeProjectIdRef.current;

      if (normalizedSourceTickets) {
        queryClient.setQueryData<Ticket[]>(sourceKey, () => {
          const nextSource = removeTicketFromList(normalizedSourceTickets, id);
          return nextSource === normalizedSourceTickets ? [...normalizedSourceTickets] : nextSource;
        });
      }

      if (optimisticTicket && normalizedTargetTickets) {
        queryClient.setQueryData<Ticket[]>(targetKey, () => {
          const nextTarget = upsertTicketInList(normalizedTargetTickets, optimisticTicket);
          return nextTarget === normalizedTargetTickets ? [...normalizedTargetTickets] : nextTarget;
        });
      }

      if (optimisticTicket && !normalizedSourceTickets && !normalizedTargetTickets) {
        queryClient.setQueryData<Ticket[]>(targetKey, (current) => {
          if (!current) {
            return [optimisticTicket];
          }

          const nextTarget = upsertTicketInList(current, optimisticTicket);
          return nextTarget === current ? [...current] : [...nextTarget];
        });
      }

      if (switchedProject) {
        setActiveProjectIdState(targetProjectId);
        setFiltersState((prev) => ({ ...prev, projectId: targetProjectId }));
        setActiveTicket(optimisticTicket);
      }

      return {
        sourceTickets: normalizedSourceTickets,
        targetTickets: normalizedTargetTickets,
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
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(sourceProjectId), [...context.sourceTickets]);
      }

      if (context?.targetTickets) {
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(targetProjectId), [...context.targetTickets]);
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
          const nextTarget = upsertTicketInList(current, ticket);
          return nextTarget === current ? [...current] : [...nextTarget];
        });
      }

      if (context?.switchedProject && ticket) {
        setActiveTicket(ticket);
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
