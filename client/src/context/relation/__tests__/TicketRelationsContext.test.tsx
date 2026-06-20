import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/queryClient';
import { useTicketRelationsContextValue } from '../TicketRelationsContext';
import type { TicketRelationsContextType } from '../TicketRelationsContext.types';
import type { Ticket } from '../../../types/domain';
import type { TicketWithRelations } from '../../../modules/tickets/utils/ticketRelations';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Source ticket',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-1',
    domainId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:00:00.000Z',
    ...overrides,
  };
}

function makeTicketWithRelations(overrides: Partial<TicketWithRelations> = {}): TicketWithRelations {
  return {
    ...makeTicket(),
    relatedTicketIds: [],
    dependencies: [],
    blockers: [],
    blockedTicket: null,
    ...overrides,
  };
}

let currentActions: TicketRelationsContextType | undefined;

function Probe({
  queryClient,
  tickets,
  activeTicket,
  activeTicketId,
  activeTicketProjectId,
  isAuthenticated,
}: {
  queryClient: QueryClient;
  tickets: Ticket[];
  activeTicket: Ticket | null;
  activeTicketId?: string;
  activeTicketProjectId: string;
  isAuthenticated: boolean;
}) {
  const actions = useTicketRelationsContextValue({
    queryClient,
    tickets,
    activeTicket,
    activeTicketId,
    activeTicketProjectId,
    isAuthenticated,
  });

  React.useEffect(() => {
    currentActions = actions;
  }, [actions]);

  return null;
}

describe('TicketRelationsContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    currentActions = undefined as unknown as TicketRelationsContextType;
  });

  it('prevents duplicate dependency adds while pending, then allows retries after rollback and supports removal', async () => {
    const queryClient = createQueryClient();
    const sourceTicket = makeTicket();
    const dependencyTicket = makeTicket({
      id: 'ticket-2',
      key: 'GRA-2',
      title: 'Dependency ticket',
    });
    const sourceDetail = makeTicketWithRelations({
      ...sourceTicket,
      dependencies: [],
      blockers: [],
    });
    const dependencyDetail = makeTicketWithRelations({
      ...dependencyTicket,
      dependencies: [],
      blockers: [],
    });
    const dependencyPostResolvers: Array<(response: Response) => void> = [];
    const dependencyDeleteResolvers: Array<(response: Response) => void> = [];

    queryClient.setQueryData(queryKeys.tickets('project-1'), [sourceTicket, dependencyTicket]);
    queryClient.setQueryData(queryKeys.ticketDetail('ticket-1'), sourceDetail);
    queryClient.setQueryData(queryKeys.ticketDetail('ticket-2'), dependencyDetail);

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/v1/tickets/ticket-1/dependencies' && method === 'POST') {
        return new Promise<Response>((resolve) => {
          dependencyPostResolvers.push(resolve);
        });
      }

      if (url === '/api/v1/tickets/ticket-1/dependencies/ticket-2' && method === 'DELETE') {
        return new Promise<Response>((resolve) => {
          dependencyDeleteResolvers.push(resolve);
        });
      }

      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe
          queryClient={queryClient}
          tickets={[sourceTicket, dependencyTicket]}
          activeTicket={sourceTicket}
          activeTicketId="ticket-1"
          activeTicketProjectId="project-1"
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentActions).toBeDefined();
    });

    expect(currentActions!.activeTicketDetail?.id).toBe('ticket-1');

    let firstAddPromise!: Promise<boolean>;
    act(() => {
      firstAddPromise = currentActions!.addTicketDependency('ticket-1', 'ticket-2');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-1'))?.dependencies)
        .toEqual([expect.objectContaining({ id: 'ticket-2' })]);
      expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-2'))?.blockers)
        .toEqual([expect.objectContaining({ id: 'ticket-1' })]);
    });

    const duplicateAdd = await currentActions!.addTicketDependency('ticket-1', 'ticket-2');
    expect(duplicateAdd).toBe(true);
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/v1/tickets/ticket-1/dependencies' && init?.method === 'POST')).toHaveLength(1);

    dependencyPostResolvers[0]?.(jsonResponse({ error: 'temporary failure' }, 500));
    await expect(firstAddPromise).resolves.toBe(false);

    expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-1'))?.dependencies).toEqual([]);
    expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-2'))?.blockers).toEqual([]);

    let retryAddPromise!: Promise<boolean>;
    act(() => {
      retryAddPromise = currentActions!.addTicketDependency('ticket-1', 'ticket-2');
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/v1/tickets/ticket-1/dependencies' && init?.method === 'POST')).toHaveLength(2);
    });

    dependencyPostResolvers[1]?.(jsonResponse({ success: true }, 201));
    await expect(retryAddPromise).resolves.toBe(true);

    expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-1'))?.dependencies)
      .toEqual([expect.objectContaining({ id: 'ticket-2' })]);
    expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-2'))?.blockers)
      .toEqual([expect.objectContaining({ id: 'ticket-1' })]);

    let removePromise!: Promise<boolean>;
    act(() => {
      removePromise = currentActions!.removeTicketDependency('ticket-1', 'ticket-2');
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/v1/tickets/ticket-1/dependencies/ticket-2' && init?.method === 'DELETE')).toHaveLength(1);
    });

    dependencyDeleteResolvers[0]?.(jsonResponse({ success: true }, 200));
    await expect(removePromise).resolves.toBe(true);

    await waitFor(() => {
      expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-1'))?.dependencies).toEqual([]);
      expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-2'))?.blockers).toEqual([]);
    });
  });

  it('rolls back reciprocal blocker updates when the mutation fails', async () => {
    const queryClient = createQueryClient();
    const sourceTicket = makeTicket();
    const blockerTicket = makeTicket({
      id: 'ticket-3',
      key: 'GRA-3',
      title: 'Blocker ticket',
    });
    const sourceDetail = makeTicketWithRelations({
      ...sourceTicket,
      dependencies: [],
      blockers: [],
    });
    const blockerDetail = makeTicketWithRelations({
      ...blockerTicket,
      dependencies: [],
      blockers: [],
    });
    const blockerPostResolvers: Array<(response: Response) => void> = [];

    queryClient.setQueryData(queryKeys.tickets('project-1'), [sourceTicket, blockerTicket]);
    queryClient.setQueryData(queryKeys.ticketDetail('ticket-1'), sourceDetail);
    queryClient.setQueryData(queryKeys.ticketDetail('ticket-3'), blockerDetail);

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/v1/tickets/ticket-1/blockers' && method === 'POST') {
        return new Promise<Response>((resolve) => {
          blockerPostResolvers.push(resolve);
        });
      }

      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe
          queryClient={queryClient}
          tickets={[sourceTicket, blockerTicket]}
          activeTicket={sourceTicket}
          activeTicketId="ticket-1"
          activeTicketProjectId="project-1"
          isAuthenticated
        />
      </QueryClientProvider>
    );

    let addBlockerPromise!: Promise<boolean>;
    act(() => {
      addBlockerPromise = currentActions!.addTicketBlocker('ticket-1', 'ticket-3');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-1'))?.blockers)
        .toEqual([expect.objectContaining({ id: 'ticket-3' })]);
      expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-3'))?.dependencies)
        .toEqual([expect.objectContaining({ id: 'ticket-1' })]);
    });

    blockerPostResolvers[0]?.(jsonResponse({ error: 'blocked relation failed' }, 500));
    await expect(addBlockerPromise).resolves.toBe(false);

    expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-1'))).toEqual(sourceDetail);
    expect(queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail('ticket-3'))).toEqual(blockerDetail);
  });
});
