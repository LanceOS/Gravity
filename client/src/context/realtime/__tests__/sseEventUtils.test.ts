import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../../utils/queryClient';
import type { Ticket } from '../../../types/domain';
import { removeSseTicketEntries } from '../sseEventUtils';

function makeTicket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 'ticket-1',
    key: 'ABC-1',
    title: 'Seed ticket',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-1',
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
        retry: false,
      },
    },
  });
}

describe('sseEventUtils', () => {
  it('removes user-scoped ticket caches from exact key queries', () => {
    const queryClient = createQueryClient();
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');

    const ticket = makeTicket({ id: 'ticket-1', key: 'ABC-20' });
    const userDetailQuery = queryKeys.ticket('ABC-20', 'user-1');
    const userRelationsQuery = queryKeys.ticketRelations('ABC-20', 'user-1');

    queryClient.setQueryData<Ticket[]>(queryKeys.tickets('project-1'), [ticket]);
    queryClient.setQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'), ticket);
    queryClient.setQueryData<Ticket>(userDetailQuery, ticket);
    queryClient.setQueryData<Ticket>(userRelationsQuery, ticket);
    queryClient.setQueryData(queryKeys.comments('ticket-1'), [
      {
        id: 'comment-1',
        ticketId: 'ticket-1',
        userId: 'user-1',
        body: 'comment',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);

    removeSseTicketEntries(queryClient, 'ABC-20', 'ticket-1', 'project-1');

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toEqual([]);
    expect(queryClient.getQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'))).toBeUndefined();
    expect(queryClient.getQueryData<Ticket>(userDetailQuery)).toBeUndefined();
    expect(queryClient.getQueryData<Ticket>(userRelationsQuery)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.comments('ticket-1'))).toBeUndefined();

    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.ticketDetail('ticket-1'),
      exact: true,
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.comments('ticket-1'),
      exact: true,
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: userDetailQuery,
      exact: true,
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: userRelationsQuery,
      exact: true,
    });
  });
});
