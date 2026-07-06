import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActiveProjectProvider, useActiveProject } from '../../project/ActiveProjectContext';
import { TicketFiltersContext, TicketFiltersProvider, useTicketFilters } from '../../filters/TicketFiltersContext';
import { initialFilters, type TicketFiltersState } from '../../shared/filters';
import { useActiveTicket } from '../ActiveTicketContext';
import { TicketListProvider, useTicketListContext } from '../TicketListContext';
import type { TicketListContextType } from '../TicketListContext.types';
import type { Ticket } from '../../../types/domain';
import { queryKeys } from '../../../utils/queryClient';

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

function getProjectIdFromInit(init?: RequestInit) {
  if (!init?.headers) {
    return '';
  }

  return new Headers(init.headers).get('x-project-id') || '';
}

const currentUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  avatar: '',
  role: 'owner',
};

const switchedUser = {
  ...currentUser,
  id: 'user-2',
  name: 'Grace Hopper',
  email: 'grace@example.com',
};

const projectOneTickets: Ticket[] = [
  {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Seed ticket',
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
  },
  {
    id: 'ticket-2',
    key: 'GRA-2',
    title: 'Second ticket',
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
    createdAt: '2026-06-18T13:00:00.000Z',
    updatedAt: '2026-06-18T13:00:00.000Z',
  },
];

const projectTwoTickets: Ticket[] = [
  {
    id: 'ticket-9',
    key: 'OPS-9',
    title: 'Project two ticket',
    description: '',
    status: 'todo',
    priority: 'high',
    assigneeId: null,
    projectId: 'project-2',
    domainId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:00:00.000Z',
  },
];

let currentValue: TicketListContextType;
let currentActiveTicket: ReturnType<typeof useActiveTicket> | undefined;
let currentProject: ReturnType<typeof useActiveProject> | undefined;
let setFilters: ((nextFilters: Partial<TicketFiltersState>) => void) | undefined;

function Probe() {
  const value = useTicketListContext();
  const activeTicket = useActiveTicket();
  const project = useActiveProject();
  const filtersContext = useTicketFilters();
  const { setFilters: nextFilters } = filtersContext;
  setFilters = nextFilters;

  React.useEffect(() => {
    currentValue = value;
    currentActiveTicket = activeTicket;
    currentProject = project;
  }, [activeTicket, project, value]);

  return null;
}

function Harness({
  queryClient,
  currentUser: harnessCurrentUser,
}: {
  queryClient: QueryClient;
  currentUser: typeof currentUser | null;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveProjectProvider>
        <TicketFiltersProvider>
          <TicketListProvider currentUser={harnessCurrentUser}>
            <Probe />
          </TicketListProvider>
        </TicketFiltersProvider>
      </ActiveProjectProvider>
    </QueryClientProvider>
  );
}

function renderWithProviders(queryClient: QueryClient, harnessCurrentUser: typeof currentUser | null = currentUser) {
  return render(
    <Harness queryClient={queryClient} currentUser={harnessCurrentUser} />
  );
}

describe('TicketListContext', () => {
  afterEach(() => {
    currentValue = undefined as unknown as TicketListContextType;
    currentActiveTicket = undefined;
    currentProject = undefined;
    setFilters = undefined;
    vi.unstubAllGlobals();
  });

  it('exposes derived maps and keeps the active ticket aligned with the latest list entry', async () => {
    const queryClient = createQueryClient();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const projectId = getProjectIdFromInit(init);
      if (url === '/api/v1/tickets' && projectId === 'project-1') {
        return Promise.resolve(jsonResponse(projectOneTickets));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentValue).toBeDefined();
      expect(currentValue.tickets).toHaveLength(2);
    });

    await waitFor(() => {
      expect(currentActiveTicket).toBeDefined();
    });

    expect(currentValue.ticketMap.get('GRA-1')).toMatchObject({ id: 'ticket-1', title: 'Seed ticket' });
    expect(currentValue.ticketById.get('ticket-2')).toMatchObject({ id: 'ticket-2', title: 'Second ticket' });
    expect(currentValue.ticketsByProject.get('project-1')?.map((ticket) => ticket.id)).toEqual(['ticket-1', 'ticket-2']);
    expect(currentActiveTicket?.activeTicket).toBeNull();

    await act(async () => {
      currentValue.setActiveTicket(projectOneTickets[0]);
    });

    await waitFor(() => {
      expect(currentActiveTicket?.activeTicket?.title).toBe('Seed ticket');
    });

    const updatedTicket = {
      ...projectOneTickets[0],
      title: 'Seed ticket (updated)',
      updatedAt: '2026-06-18T15:00:00.000Z',
    };

    await act(async () => {
      queryClient.setQueryData(queryKeys.tickets('project-1'), [updatedTicket, projectOneTickets[1]]);
    });

    await waitFor(() => {
      expect(currentValue.activeTicket?.title).toBe('Seed ticket (updated)');
      expect(currentActiveTicket?.activeTicket?.title).toBe('Seed ticket (updated)');
    });
  });

  it('indexes subtasks by parent ticket id', async () => {
    const queryClient = createQueryClient();
    const subtaskTicket: Ticket = {
      ...projectOneTickets[0],
      id: 'ticket-3',
      key: 'GRA-3',
      title: 'Child ticket',
      parentId: 'ticket-1',
      createdAt: '2026-06-18T14:00:00.000Z',
      updatedAt: '2026-06-18T14:00:00.000Z',
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const projectId = getProjectIdFromInit(init);
      if (url === '/api/v1/tickets' && projectId === 'project-1') {
        return Promise.resolve(jsonResponse([...projectOneTickets, subtaskTicket]));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentValue.ticketsByParentId.get('ticket-1')?.map((ticket) => ticket.id)).toEqual(['ticket-3']);
    });
  });

  it('retains the previous list while the next project fetch is still pending', async () => {
    const queryClient = createQueryClient();
    let resolveProjectTwoTickets!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const projectId = getProjectIdFromInit(init);
      if (url === '/api/v1/tickets' && projectId === 'project-1') {
        return Promise.resolve(jsonResponse(projectOneTickets));
      }
      if (url === '/api/v1/tickets' && projectId === 'project-2') {
        return new Promise<Response>((resolve) => {
          resolveProjectTwoTickets = resolve;
        });
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentValue.tickets.map((ticket) => ticket.id)).toEqual(['ticket-1', 'ticket-2']);
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-2');
    });

    expect(currentValue.tickets.map((ticket) => ticket.id)).toEqual(['ticket-1', 'ticket-2']);

    await waitFor(() => {
      expect(resolveProjectTwoTickets).toBeDefined();
    });

    resolveProjectTwoTickets(jsonResponse(projectTwoTickets));

    await waitFor(() => {
      expect(currentValue.tickets.map((ticket) => ticket.id)).toEqual(['ticket-9']);
      expect(currentValue.ticketById.get('ticket-9')?.title).toBe('Project two ticket');
      expect(currentValue.ticketsByProject.get('project-2')?.map((ticket) => ticket.id)).toEqual(['ticket-9']);
    });
  });

  it('does not trigger another project query when filter scope changes away from active project', async () => {
    const queryClient = createQueryClient();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const projectId = getProjectIdFromInit(init);
      if (url === '/api/v1/tickets' && projectId === 'project-1') {
        return Promise.resolve(jsonResponse(projectOneTickets));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);
    setFilters = undefined;

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentValue).toBeDefined();
      expect(currentValue.tickets.map((ticket) => ticket.id)).toEqual(['ticket-1', 'ticket-2']);
    });

    await act(async () => {
      setFilters?.({ projectId: 'project-2' });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentValue.tickets.map((ticket) => ticket.id)).toEqual(['ticket-1', 'ticket-2']);
  });

  it('clears preserved tickets and the active ticket when the authenticated user changes', async () => {
    const queryClient = createQueryClient();
    let resolveNextFetch!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const projectId = getProjectIdFromInit(init);
        if (url === '/api/v1/tickets' && projectId === 'project-1') {
          return Promise.resolve(jsonResponse(projectOneTickets));
        }
        return Promise.resolve(jsonResponse([]));
      })
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveNextFetch = resolve;
      }));

    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderWithProviders(queryClient, currentUser);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentValue.tickets).toHaveLength(2);
    });

    await act(async () => {
      currentValue.setActiveTicket(projectOneTickets[0]);
    });

    await waitFor(() => {
      expect(currentValue.activeTicket?.id).toBe('ticket-1');
    });

    await act(async () => {
      queryClient.clear();
      rerender(<Harness queryClient={queryClient} currentUser={switchedUser} />);
    });

    await waitFor(() => {
      expect(currentValue.tickets).toEqual([]);
      expect(currentValue.ticketMap.size).toBe(0);
      expect(currentValue.activeTicket).toBeNull();
      expect(currentActiveTicket?.activeTicket).toBeNull();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveNextFetch(jsonResponse([]));
    });

    await waitFor(() => {
      expect(currentValue.tickets).toEqual([]);
      expect(currentValue.activeTicket).toBeNull();
    });
  });

  it('fetches the active project when filter scope is temporarily empty', async () => {
    const queryClient = createQueryClient();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const projectId = getProjectIdFromInit(init);
      if (url === '/api/v1/tickets' && projectId === 'project-1') {
        return Promise.resolve(jsonResponse(projectOneTickets));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    let localValue: TicketListContextType | undefined;
    let localProject: ReturnType<typeof useActiveProject> | undefined;
    const emptyFilterState: TicketFiltersState = {
      ...initialFilters,
      projectId: '',
    };

    function StaticFilterHarness() {
      return (
        <TicketFiltersContext.Provider
          value={{
            filters: emptyFilterState,
            setFilters: vi.fn(),
            resetFilters: vi.fn(),
          }}
        >
          <TicketListProvider currentUser={currentUser}>
            <Probe />
          </TicketListProvider>
        </TicketFiltersContext.Provider>
      );
    }

    function Probe() {
      const value = useTicketListContext();
      const project = useActiveProject();
      localValue = value;
      localProject = project;

      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ActiveProjectProvider>
          <StaticFilterHarness />
        </ActiveProjectProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(localProject).toBeDefined();
    });

    await act(async () => {
      localProject?.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(localValue?.tickets.map((ticket) => ticket.id)).toEqual(['ticket-1', 'ticket-2']);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
