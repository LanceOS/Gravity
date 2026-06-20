import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Project, Ticket } from '../../../types/domain';
import { queryKeys } from '../../../utils/queryClient';
import { TicketMutationProvider, useTicketMutations } from '../TicketMutationContext';
import type { TicketMutationContextType } from '../TicketMutationContext.types';
import { TICKET_UPDATE_DEBOUNCE_MS } from '../ticketMutationUtils';

const mocks = vi.hoisted(() => {
  const moveTicketMock = vi.fn().mockResolvedValue(true);

  return {
    moveTicketMock,
    useActiveTicket: vi.fn(),
    useActiveProject: vi.fn(),
    useTicketFilters: vi.fn(),
  };
});

vi.mock('../ActiveTicketContext', () => ({
  useActiveTicket: mocks.useActiveTicket,
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

const aggregateProject: Project = {
  id: 'project-1',
  name: 'Gravity Core',
  key: 'GRA',
  description: '',
  status: 'active',
  workspaceId: 'workspace-1',
  teamId: 'team-1',
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
}: {
  activeTicket?: Ticket | null;
} = {}) {
  const setActiveTicket = vi.fn();

  mocks.useActiveTicket.mockReturnValue({
    activeTicket,
    setActiveTicket,
  });

  mocks.useActiveProject.mockReturnValue({
    activeProjectId: activeTicket?.projectId ?? baseTicket.projectId,
    activeProjectIdRef: { current: activeTicket?.projectId ?? baseTicket.projectId },
    setActiveProjectId: vi.fn(),
  });

  mocks.useTicketFilters.mockReturnValue({
    setFilters: vi.fn(),
  });

  return {
    setActiveTicket,
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
    queryClient.setQueryData(queryKeys.projects('user-1'), [aggregateProject]);
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    configureContext();
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
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['workspaceTickets', 'workspace-1'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['teamTickets', 'team-1'] });
  });

  it('batches debounced ticket updates into a single request', async () => {
    vi.useFakeTimers();

    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.tickets('project-1'), [baseTicket]);

    configureContext({ activeTicket: baseTicket });
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

    const { setActiveTicket } = configureContext({ activeTicket: baseTicket });
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
    configureContext({ activeTicket: baseTicket });
    renderWithProvider(queryClient);

    await act(async () => {
      await currentActions.moveTicket(baseTicket.id, 'project-1', 'project-2');
    });

    expect(mocks.moveTicketMock).toHaveBeenCalledWith(baseTicket.id, 'project-1', 'project-2');
  });
});
