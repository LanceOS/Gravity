import { toast } from '@library';
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Project, Ticket } from '../../../types/domain';
import { queryKeys } from '../../../utils/queryClient';
import { TicketMutationProvider, useTicketMutations } from '../TicketMutationContext';
import type { TicketMutationContextType } from '../TicketMutationContext.types';
import { removeSseTicketSubtree } from '../../realtime/sseEventUtils';
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
  // eslint-disable-next-line react-hooks/globals -- Test probe exposes the rendered context to assertions outside React.
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

  it('applies the confirmed server ticket payload so cleared relation flags replace optimistic stale state', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.projects('user-1'), [aggregateProject]);
    const staleTicket: Ticket = {
      ...baseTicket,
      isBlocked: true,
      isDependency: true,
    };
    queryClient.setQueryData(queryKeys.tickets('project-1'), [staleTicket]);
    queryClient.setQueryData(queryKeys.ticketDetail(baseTicket.id), {
      ...staleTicket,
      dependencies: [{ id: 'ticket-2', key: 'GRA-2', title: 'Dependency', projectId: 'project-1' }],
      blockers: [{ id: 'ticket-3', key: 'GRA-3', title: 'Blocker', projectId: 'project-1' }],
      relatedTicketIds: ['ticket-2', 'ticket-3'],
      blockedTicket: { id: 'ticket-3', key: 'GRA-3', title: 'Blocker', projectId: 'project-1' },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    configureContext({ activeTicket: staleTicket });
    const updatedTicket: Ticket = {
      ...baseTicket,
      status: 'done',
      isBlocked: false,
      isDependency: false,
      updatedAt: '2026-06-02T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updatedTicket));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(queryClient);

    await act(async () => {
      void currentActions.updateTicket(baseTicket.id, { status: 'done' });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))?.[0]).toMatchObject({
      id: baseTicket.id,
      status: 'done',
      isBlocked: false,
      isDependency: false,
    });
    expect(queryClient.getQueryData</* eslint-disable-line @typescript-eslint/no-explicit-any -- This test supplies a partial mock or malformed fixture at a component/transport boundary. */ any>(queryKeys.ticketDetail(baseTicket.id))).toMatchObject({
      id: baseTicket.id,
      status: 'done',
      isBlocked: false,
      isDependency: false,
      dependencies: [],
      blockers: [],
      relatedTicketIds: [],
      blockedTicket: null,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['workspaceTickets', 'workspace-1'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['teamTickets', 'team-1'] });
  });

  it('reconciles deleted descendants from the response without a realtime connection', async () => {
    const client = createQueryClient();
    const child = { ...baseTicket, id: 'child', key: 'ABC-2', parentId: baseTicket.id };
    client.setQueryData(queryKeys.tickets('project-1'), [baseTicket, child]);
    client.setQueryData(queryKeys.ticketDetail(child.id), child);
    client.setQueryData(queryKeys.comments(child.id), [{ id: 'comment' }]);
    const { setActiveTicket } = configureContext({ activeTicket: child });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, deletedTickets: [baseTicket, child] })));
    renderWithProvider(client);
    await act(async () => { await currentActions.deleteTicket(baseTicket.id); });
    expect(client.getQueryData(queryKeys.tickets('project-1'))).toEqual([]);
    expect(client.getQueryData(queryKeys.ticketDetail(child.id))).toBeUndefined();
    expect(client.getQueryData(queryKeys.comments(child.id))).toBeUndefined();
    expect(setActiveTicket).toHaveBeenCalledWith(null);
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

  it('awaits ticket persistence and reports failure without a success toast', async () => {
    configureContext({ activeTicket: baseTicket });
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const notification = vi.spyOn(toast, 'show').mockReturnValue('test');
    renderWithProvider(client);
    let saving!: Promise<boolean | void>;
    let settled = false;
    act(() => { saving = currentActions.updateTicket(baseTicket.id, { title: 'Changed' }); saving.then(() => { settled = true; }); });
    await act(async () => { await Promise.resolve(); });
    expect(settled).toBe(false);
    expect(notification).not.toHaveBeenCalled();
    await act(async () => { finish(jsonResponse({ error: 'Offline' }, 500)); expect(await saving).toBe(false); });
    expect(notification).toHaveBeenCalledExactlyOnceWith('Offline Please try again.', 'error');
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))?.[0].title).toBe(baseTicket.title);
    notification.mockRestore();
  });

  it('saves debounced updates after Strict Mode effect replay', async () => {
    vi.useFakeTimers();
    configureContext();
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...baseTicket, title: 'Changed' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<React.StrictMode><QueryClientProvider client={client}>
      <TicketMutationProvider><Probe /></TicketMutationProvider>
    </QueryClientProvider></React.StrictMode>);
    await act(async () => {
      await currentActions.updateTicket(baseTicket.id, { title: 'Changed' }, { immediate: false });
      await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))?.[0].title).toBe('Changed');
  });

  it('cancels pending saves on unmount', async () => {
    vi.useFakeTimers();
    configureContext();
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWithProvider(client);
    await act(async () => {
      await currentActions.updateTicket(baseTicket.id, { title: 'Changed' }, { immediate: false });
    });
    view.unmount();
    await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores an in-flight debounced response after unmount', async () => {
    vi.useFakeTimers();
    configureContext();
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const notification = vi.spyOn(toast, 'show').mockReturnValue('test');
    const view = renderWithProvider(client);
    await act(async () => {
      await currentActions.updateTicket(baseTicket.id, { title: 'Optimistic' }, { immediate: false });
      await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
    });
    view.unmount();
    await act(async () => {
      finish(jsonResponse({ ...baseTicket, title: 'Server response' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(notification).not.toHaveBeenCalled();
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))?.[0].title).toBe('Optimistic');
    notification.mockRestore();
  });

  it('rolls back a failed debounced save and preserves queued edits for the next request', async () => {
    vi.useFakeTimers();
    configureContext();
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ...baseTicket, priority: 'high' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(client);
    await act(async () => {
      await currentActions.updateTicket(baseTicket.id, { title: 'Failed' }, { immediate: false });
      await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
      await currentActions.updateTicket(baseTicket.id, { priority: 'high' }, { immediate: false });
      finish(jsonResponse({ error: 'Offline' }, 500));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))?.[0]).toMatchObject({
      title: baseTicket.title, priority: 'high',
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ priority: 'high' }));
  });

  it('queues edits from a child mount effect during Strict Mode initialization', async () => {
    vi.useFakeTimers();
    configureContext();
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...baseTicket, title: 'Mount edit' }));
    vi.stubGlobal('fetch', fetchMock);
    function SaveOnMount() {
      const { updateTicket } = useTicketMutations();
      React.useEffect(() => {
        void updateTicket(baseTicket.id, { title: 'Mount edit' }, { immediate: false });
      }, [updateTicket]);
      return null;
    }
    render(<React.StrictMode><QueryClientProvider client={client}>
      <TicketMutationProvider><SaveOnMount /></TicketMutationProvider>
    </QueryClientProvider></React.StrictMode>);
    await act(async () => { await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps newer queued edits visible and rolls back to the last confirmed response', async () => {
    vi.useFakeTimers();
    configureContext({ activeTicket: baseTicket });
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket]);
    let finishFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishFirst = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Offline' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(client);
    await act(async () => {
      await currentActions.updateTicket(baseTicket.id, { title: 'First edit' }, { immediate: false });
      await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
      await currentActions.updateTicket(baseTicket.id, { priority: 'high' }, { immediate: false });
      finishFirst(jsonResponse({ ...baseTicket, title: 'Canonical server title' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))?.[0]).toMatchObject({
      title: 'Canonical server title', priority: 'high',
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS); });
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))?.[0]).toMatchObject({
      title: 'Canonical server title', priority: baseTicket.priority,
    });
  });

  it('does not undo another ticket save when a debounced request fails', async () => {
    vi.useFakeTimers();
    configureContext();
    const other = { ...baseTicket, id: 'ticket-2', key: 'GRA-2' };
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket, other]);
    let failFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { failFirst = resolve; }))
      .mockResolvedValueOnce(jsonResponse({ ...other, title: 'Saved other ticket' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(client);
    await act(async () => {
      await currentActions.updateTicket(baseTicket.id, { title: 'Failed' }, { immediate: false });
      await currentActions.updateTicket(other.id, { title: 'Saved other ticket' }, { immediate: false });
      await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
      failFirst(jsonResponse({ error: 'Offline' }, 500));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getQueryData<Ticket[]>(queryKeys.tickets(baseTicket.projectId))).toMatchObject([
      { title: baseTicket.title }, { title: 'Saved other ticket' },
    ]);
  });

  it.each(['local', 'remote'])('does not send queued descendant edits after %s subtree deletion', async (source) => {
    vi.useFakeTimers();
    configureContext();
    const root = { ...baseTicket, id: 'root', key: 'GRA-0' };
    const child = { ...baseTicket, parentId: root.id };
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [root, child]);
    client.setQueryData(queryKeys.ticketDetail(child.id), child);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deletedTickets: [root, child] }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider(client);
    await act(async () => {
      await currentActions.updateTicket(child.id, { title: 'Queued' }, { immediate: false });
      if (source === 'local') await currentActions.deleteTicket(root.id);
      else removeSseTicketSubtree(client, [root, child]);
      await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(source === 'local' ? 1 : 0);
    expect(client.getQueryData(queryKeys.tickets(baseTicket.projectId))).toEqual([]);
    expect(client.getQueryData(queryKeys.ticketDetail(child.id))).toBeUndefined();
  });

  it.each([
    ['debounced', 200], ['debounced', 404], ['immediate', 200], ['immediate', 404],
  ] as const)('ignores an in-flight %s response (%s) after remote subtree deletion', async (mode, status) => {
    vi.useFakeTimers();
    configureContext();
    const root = { ...baseTicket, id: 'root', key: 'GRA-0' };
    const child = { ...baseTicket, parentId: root.id };
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [root, child]);
    client.setQueryData(queryKeys.ticketDetail(child.id), child);
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    renderWithProvider(client);
    let saving!: Promise<boolean | void>;
    await act(async () => {
      saving = currentActions.updateTicket(child.id, { title: 'In flight' }, { immediate: mode === 'immediate' });
      if (mode === 'debounced') await vi.advanceTimersByTimeAsync(TICKET_UPDATE_DEBOUNCE_MS);
    });
    await act(async () => {
      removeSseTicketSubtree(client, [root, child]);
      finish(jsonResponse(status === 200 ? { ...child, title: 'Late save' } : { error: 'Deleted' }, status));
      await saving;
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getQueryData(queryKeys.tickets(baseTicket.projectId))).toEqual([]);
    expect(client.getQueryData(queryKeys.ticketDetail(child.id))).toBeUndefined();
  });

  it('does not restore deleted siblings from an unrelated immediate-save rollback', async () => {
    configureContext();
    const sibling = { ...baseTicket, id: 'sibling', key: 'GRA-2' };
    const client = createQueryClient();
    client.setQueryData(queryKeys.tickets(baseTicket.projectId), [baseTicket, sibling]);
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    renderWithProvider(client);
    let saving!: Promise<boolean | void>;
    await act(async () => { saving = currentActions.updateTicket(sibling.id, { title: 'Fail' }); });
    await act(async () => {
      removeSseTicketSubtree(client, [baseTicket]);
      finish(jsonResponse({ error: 'Offline' }, 500));
      await saving;
    });
    expect(client.getQueryData(queryKeys.tickets(baseTicket.projectId))).toEqual([sibling]);
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
