import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../utils/queryClient';
import type { Ticket } from '../../types/domain';
import {
  findCachedTicketByKeyOrId,
  invalidateTicketCaches,
  patchTicketInAllCaches,
} from './ticketCache';

function makeTicket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 'ticket-1',
    key: 'ABC-1',
    title: 'Initial title',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-a',
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 60 * 60 * 1000,
        staleTime: 30 * 1000,
        retry: false,
      },
    },
  });
}

describe('ticket cache helpers', () => {
  it('finds ticket in the project-scoped list cache before broad scanning', () => {
    const queryClient = createQueryClient();
    const matchByProject = makeTicket({ id: 'ticket-1', key: 'ABC-1', projectId: 'project-b' });
    const staleInOtherProject = makeTicket({ id: 'ticket-1', key: 'ABC-1', projectId: 'project-a', title: 'Old' });

    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-a'), [staleInOtherProject]);
    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-b'), [matchByProject]);

    const result = findCachedTicketByKeyOrId(queryClient, 'ABC-1', 'ticket-1', 'project-b');

    expect(result).toMatchObject({ id: 'ticket-1', title: 'Initial title', projectId: 'project-b' });
    expect(result).not.toMatchObject({ title: 'Old' });
  });

  it('uses exact ticket key cache when available', () => {
    const queryClient = createQueryClient();
    const directMatch = makeTicket({ key: 'ABC-2', title: 'By detail cache' });

    queryClient.setQueryData<Ticket>(queryKeys.ticket('ABC-2'), directMatch);

    const result = findCachedTicketByKeyOrId(queryClient, 'abc-2', 'missing');

    expect(result).toMatchObject({ id: 'ticket-1', key: 'ABC-2', title: 'By detail cache' });
  });

  it('patches only the project-scoped list cache when project is supplied', () => {
    const queryClient = createQueryClient();
    const sourceProjectTicket = makeTicket({ id: 'ticket-1', key: 'ABC-3', title: 'Source', projectId: 'project-1' });
    const staleInOtherProject = makeTicket({ id: 'ticket-1', key: 'ABC-3', title: 'Target stale', projectId: 'project-2' });

    const listProjectOne = [sourceProjectTicket];
    const listProjectTwo = [staleInOtherProject];

    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-1'), listProjectOne);
    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-2'), listProjectTwo);

    queryClient.setQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'), sourceProjectTicket);
    queryClient.setQueryData<Ticket>(queryKeys.ticket('ABC-3'), sourceProjectTicket);
    queryClient.setQueryData<Ticket>(queryKeys.ticketRelations('ABC-3'), sourceProjectTicket);

    patchTicketInAllCaches(
      queryClient,
      'ticket-1',
      (ticket) => ({ ...ticket, title: 'Updated title' }),
      { projectId: 'project-1', ticketKey: 'ABC-3' }
    );

    const scopedProjectTickets = queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'));
    const staleProjectTickets = queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-2'));

    expect(scopedProjectTickets?.[0]).toMatchObject({ title: 'Updated title' });
    expect(staleProjectTickets?.[0]).toMatchObject({ title: 'Target stale' });

    expect(queryClient.getQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'))).toMatchObject({ title: 'Updated title' });
    expect(queryClient.getQueryData<Ticket>(queryKeys.ticket('ABC-3'))).toMatchObject({ title: 'Updated title' });
    expect(queryClient.getQueryData<Ticket>(queryKeys.ticketRelations('ABC-3'))).toMatchObject({ title: 'Updated title' });
  });

  it('patches list cache using resolved ticket detail project when projectId is omitted', () => {
    const queryClient = createQueryClient();
    const scopedTicket = makeTicket({ id: 'ticket-1', key: 'ABC-5', title: 'Before', projectId: 'project-1' });
    const staleTicket = makeTicket({ id: 'ticket-1', key: 'ABC-5', title: 'Should stay', projectId: 'project-stale' });

    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-1'), [staleTicket]);
    queryClient.setQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'), scopedTicket);

    patchTicketInAllCaches(
      queryClient,
      'ticket-1',
      (ticket) => ({ ...ticket, title: 'Updated title' }),
      { ticketKey: 'ABC-5' }
    );

    const projectOneTickets = queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'));
    expect(projectOneTickets?.[0]).toMatchObject({ title: 'Updated title' });
  });

  it('invalidates ticket-key-specific detail caches when ticket key is known in cache', () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData(queryKeys.ticketDetail('ticket-1'), makeTicket({ key: 'ABC-4' }));

    invalidateTicketCaches(queryClient, 'ticket-1', 'project-1');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.tickets('project-1'),
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.ticketDetail('ticket-1'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['tickets', 'detail', 'ABC-4'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['tickets', 'relations', 'ABC-4'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tickets', 'detail'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tickets', 'relations'],
    });
  });

  it('infers project-specific list invalidation from cached ticket detail', () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const scopedTicket = makeTicket({ id: 'ticket-1', key: 'ABC-6', projectId: 'project-1', title: 'Cached title' });

    queryClient.setQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'), scopedTicket);
    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-1'), [scopedTicket]);

    invalidateTicketCaches(queryClient, 'ticket-1');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.tickets('project-1'),
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.ticketDetail('ticket-1'),
    });
  });
});
