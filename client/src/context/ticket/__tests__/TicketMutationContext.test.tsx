import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Ticket } from '../../../types/domain';
import { queryKeys } from '../../../utils/queryClient';
import { TicketMutationProvider, useTicketMutations } from '../TicketMutationContext';
import type { TicketMutationContextType } from '../TicketMutationContext.types';
import { TICKET_UPDATE_DEBOUNCE_MS } from '../ticketMutationUtils';

const mocks = vi.hoisted(() => {
  const moveTicketMock = vi.fn().mockResolvedValue(true);

  return {
    moveTicketMock,
    useTickets: vi.fn(),
    useActiveProject: vi.fn(),
    useTicketFilters: vi.fn(),
  };
});

vi.mock('../../TicketContextContext', () => ({
  useTickets: mocks.useTickets,
}));

vi.mock('../../project/ActiveProjectContext', () => ({
  useActiveProject: mocks.useActiveProject,
}));

vi.mock('../../filters/TicketFiltersContext', () => ({
  useTicketFilters: mocks.useTicketFilters,
}));

vi.mock('../../utils/useMoveTicket', () => ({
  useMoveTicket: () => mocks.moveTicketMock,
}));

const baseTicket: Ticket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'Seed ticket',
  description: '',
  status: 'todo',
  priority: 'medium',
  projectId: 'project-1',
  assigneeId: null,
  cycleId: null,
  parentId: null,
  prStatus: 'none',
  prUrl: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let currentActions: TicketMutationContextType;

function Probe() {
  currentActions = useTicketMutations();
  return null;
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

function renderWithProvider(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TicketMutationProvider>
        <Probe />
      </TicketMutationProvider>
    </QueryClientProvider>
  );
}

function configureContext({
  activeTicket = null,
  cachedTicket = baseTicket,
}: {
  activeTicket?: Ticket | null;
  cachedTicket?: Ticket | null;
} = {}) {
  const setActiveTicket = vi.fn();
  const invalidateAggregateTicketQueries = vi.fn();
  const findCachedTicketByKeyOrId = vi.fn((ticketKey?: string, ticketId?: string) => {
    if (!cachedTicket) {
      return undefined;
    }

    if (ticketId && ticketId === cachedTicket.id) {
      return cachedTicket;
    }

    if (ticketKey && ticketKey.toUpperCase() === cachedTicket.key.toUpperCase()) {
      return cachedTicket;
    }

    return undefined;
  });

  mocks.useTickets.mockReturnValue({
    activeTicket,
    setActiveTicket,
    invalidateAggregateTicketQueries,
    findCachedTicketByKeyOrId,
  });

  mocks.useActiveProject.mockReturnValue({
    activeProjectId: cachedTicket?.projectId ?? '',
    activeProjectIdRef: { current: cachedTicket?.projectId ?? '' },
    setActiveProjectId: vi.fn(),
  });

  mocks.useTicketFilters.mockReturnValue({
    setFilters: vi.fn(),
  });

  return {
    setActiveTicket,
    invalidateAggregateTicketQueries,
    findCachedTicketByKeyOrId,
  };
}

describe('TicketMutationProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(() => {
    currentActions = undefined as unknown as TicketMutationContextType;
  });

  it('creates tickets and invalidates aggregate queries', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.tickets('project-1'), [] as Ticket[]);

    const { invalidateAggregateTicketQueries } = configureContext();
    const createdTicket: Ticket = {
      ...baseTicket,
      id: 'ticket-2',
      key: 'GRA-2',
      title: 'Created ticket',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(createdTicket));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(queryClient);

    await act(async () => {
      const result = await currentActions.createTicket({
        title: 'Created ticket',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'project-1',
        cycleId: null,
        assigneeId: null,
        parentId: null,
      });

      expect(result).toEqual(createdTicket);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/tickets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Project-Id': 'project-1',
        }),
      })
    );
    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toEqual([createdTicket]);
    expect(invalidateAggregateTicketQueries).toHaveBeenCalledWith('project-1');
  });

  it('batches debounced ticket updates into a single request', async () => {
    vi.useFakeTimers();

    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.tickets('project-1'), [baseTicket]);

    configureContext({ activeTicket: baseTicket, cachedTicket: baseTicket });
    const updatedTicket: Ticket = {
      ...baseTicket,
      title: 'Renamed ticket',
      priority: 'high',
      updatedAt: '2026-06-02T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updatedTicket));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(queryClient);

    await act(async () => {
      void currentActions.updateTicket(baseTicket.id, { title: 'Renamed ticket' }, { immediate: false });
      void currentActions.updateTicket(baseTicket.id, { priority: 'high' }, { immediate: false });
    });

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))?.[0]).toMatchObject({
      id: baseTicket.id,
      title: 'Renamed ticket',
      priority: 'high',
    });

    await act(async () => {
      vi.advanceTimersByTime(TICKET_UPDATE_DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/tickets/${baseTicket.id}`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'X-Project-Id': 'project-1',
        }),
        body: JSON.stringify({
          title: 'Renamed ticket',
          priority: 'high',
        }),
      })
    );
  });

  it('rolls back failed updates and clears the active ticket on delete', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.tickets('project-1'), [baseTicket]);

    const { setActiveTicket } = configureContext({ activeTicket: baseTicket, cachedTicket: baseTicket });
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(queryClient);

    await act(async () => {
      void currentActions.updateTicket(baseTicket.id, { title: 'Broken update' });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toEqual([baseTicket]);
    expect(setActiveTicket).toHaveBeenCalledWith(baseTicket);

    const deleteResponse = new Response(null, { status: 204 });
    fetchMock.mockResolvedValueOnce(deleteResponse);

    await act(async () => {
      await currentActions.deleteTicket(baseTicket.id);
    });

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toEqual([]);
    expect(setActiveTicket).toHaveBeenCalledWith(null);
  });

  it('delegates moveTicket to the injected move hook', async () => {
    const queryClient = createQueryClient();
    configureContext({ activeTicket: baseTicket, cachedTicket: baseTicket });
    renderWithProvider(queryClient);

    await act(async () => {
      await currentActions.moveTicket(baseTicket.id, 'project-1', 'project-2');
    });

    expect(mocks.moveTicketMock).toHaveBeenCalledWith(baseTicket.id, 'project-1', 'project-2');
  });
});
