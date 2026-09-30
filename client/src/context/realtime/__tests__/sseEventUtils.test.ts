import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../../utils/queryClient';
import type { Ticket } from '../../../types/domain';
import { removeSseTicketEntries, removeSseTicketSubtree } from '../sseEventUtils';

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
  it('removes a complete deletion batch and invalidates surviving relation snapshots', () => {
    const client = createQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const root = makeTicket({ id: 'root', key: 'ABC-1' });
    const child = makeTicket({ id: 'child', key: 'ABC-2', parentId: 'root' });
    const grandchild = makeTicket({ id: 'grandchild', key: 'ABC-3', parentId: 'child' });
    const survivor = makeTicket({ id: 'survivor', key: 'ABC-4' });
    // Descendants can be cached only as details, absent from the current list.
    client.setQueryData(queryKeys.tickets('project-1'), [root, survivor]);
    for (const ticket of [root, child, grandchild, survivor]) {
      client.setQueryData(queryKeys.ticketDetail(ticket.id), ticket);
      client.setQueryData(queryKeys.ticket(ticket.key, 'actor'), ticket);
      client.setQueryData(queryKeys.comments(ticket.id), [{ id: 'comment' }]);
    }
    expect(removeSseTicketSubtree(client, [root, child, grandchild])).toBe(true);
    expect(client.getQueryData(queryKeys.tickets('project-1'))).toEqual([survivor]);
    for (const ticket of [root, child, grandchild]) {
      expect(client.getQueryData(queryKeys.ticketDetail(ticket.id))).toBeUndefined();
      expect(client.getQueryData(queryKeys.ticket(ticket.key, 'actor'))).toBeUndefined();
      expect(client.getQueryData(queryKeys.comments(ticket.id))).toBeUndefined();
    }
    expect(client.getQueryData(queryKeys.ticketDetail(survivor.id))).toEqual(survivor);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ticketDetails() });
  });

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
