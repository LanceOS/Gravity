import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActiveProjectProvider, useActiveProject } from '../../project/ActiveProjectContext';
import { ProjectContext } from '../../project/ProjectContext';
import type { ProjectContextType } from '../../project/ProjectContext.types';
import { createProjectLookup } from '../../project/projectCacheUtils';
import { ActiveTicketContext, useActiveTicket } from '../../ticket/ActiveTicketContext';
import { RealtimeProvider, useRealtimeContext } from '../RealtimeContext';
import type { RealtimeContextType } from '../RealtimeContext.types';
import type { Project, Ticket } from '../../../types/domain';
import { queryKeys } from '../../../utils/queryClient';

type MockSseHandler = (event: MessageEvent | Event) => void;

const realtimeMocks = vi.hoisted(() => {
  class MockSseService {
    public on = vi.fn((eventType: string, handler: MockSseHandler) => {
      if (eventType === 'message') {
        this.messageHandler = handler;
      }
    });

    public off = vi.fn((eventType: string, handler: MockSseHandler) => {
      if (eventType === 'message' && this.messageHandler === handler) {
        this.messageHandler = undefined;
      }
    });

    public connect = vi.fn();
    public disconnect = vi.fn();
    public messageHandler: MockSseHandler | undefined;

    emitMessage(payload: unknown): void {
      this.messageHandler?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
    }
  }

  const serviceRegistry = new Map<string, MockSseService>();
  const getSseServiceMock = vi.fn((workspaceId: string) => {
    let service = serviceRegistry.get(workspaceId);
    if (!service) {
      service = new MockSseService();
      serviceRegistry.set(workspaceId, service);
    }
    return service;
  });
  const disposeSseServiceMock = vi.fn();

  return {
    MockSseService,
    serviceRegistry,
    getSseServiceMock,
    disposeSseServiceMock,
  };
});

const {
  serviceRegistry,
  getSseServiceMock,
  disposeSseServiceMock,
} = realtimeMocks;

vi.mock('../../../services/sseService', () => ({
  getSseService: realtimeMocks.getSseServiceMock,
  disposeSseService: realtimeMocks.disposeSseServiceMock,
}));

vi.mock('../../../services/SseEventCoalescer', () => ({
  SseEventCoalescer: class MockSseEventCoalescer {
    public destroy = vi.fn();
    private readonly onFlush: (events: any[]) => void;

    constructor(onFlush: (events: any[]) => void) {
      this.onFlush = onFlush;
    }

    enqueue(event: any) {
      if (!event) return;
      this.onFlush([event]);
    }
  },
}));

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

const projects: Project[] = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    description: '',
    key: 'GRA',
    status: 'active',
    workspaceId: 'workspace-1',
    teamId: null,
  },
  {
    id: 'project-2',
    name: 'Orbit Ops',
    description: '',
    key: 'OPS',
    status: 'active',
    workspaceId: 'workspace-2',
    teamId: null,
  },
];

const projectLookup = createProjectLookup(projects);

const projectContextValue: ProjectContextType = {
  projects,
  projectsLoading: false,
  projectLookup,
  projectById: new Map(projects.map((project) => [project.id, project])),
  projectsByWorkspaceId: new Map([
    ['workspace-1', [projects[0]]],
    ['workspace-2', [projects[1]]],
  ]),
  fetchInitialData: async () => {},
  fetchProjectData: async () => {},
  createProject: async () => null,
  updateProject: async () => null,
  deleteProject: async () => {},
  joinProject: async () => null,
};

const baseTicket: Ticket = {
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
};

let currentRealtime: RealtimeContextType;
let currentProject: ReturnType<typeof useActiveProject> | undefined;
let currentActiveTicket: ReturnType<typeof useActiveTicket> | undefined;

function ActiveTicketHarness({ children }: { children: React.ReactNode }) {
  const [activeTicket, setActiveTicket] = React.useState<Ticket | null>(null);
  const value = React.useMemo(() => ({ activeTicket, setActiveTicket }), [activeTicket]);

  return (
    <ActiveTicketContext.Provider value={value}>
      {children}
    </ActiveTicketContext.Provider>
  );
}

function Probe() {
  const realtime = useRealtimeContext();
  const project = useActiveProject();
  const activeTicket = useActiveTicket();

  React.useEffect(() => {
    currentRealtime = realtime;
    currentProject = project;
    currentActiveTicket = activeTicket;
  }, [activeTicket, project, realtime]);

  return null;
}

function renderWithProviders(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveProjectProvider>
        <ActiveTicketHarness>
          <ProjectContext.Provider value={projectContextValue}>
            <RealtimeProvider currentUserId="user-1">
              <Probe />
            </RealtimeProvider>
          </ProjectContext.Provider>
        </ActiveTicketHarness>
      </ActiveProjectProvider>
    </QueryClientProvider>
  );
}

describe('RealtimeContext', () => {
  beforeEach(() => {
    currentRealtime = undefined as unknown as RealtimeContextType;
    currentProject = undefined;
    currentActiveTicket = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    serviceRegistry.clear();
  });

  it('updates ticket caches from SSE events and skips self-originated messages', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.tickets('project-1'), [] as Ticket[]);
    vi.spyOn(queryClient, 'invalidateQueries');
    vi.stubGlobal('EventSource', class {});

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentRealtime.workspaceId).toBe('workspace-1');
      expect(getSseServiceMock).toHaveBeenCalledWith('workspace-1');
    });

    const service = serviceRegistry.get('workspace-1');
    expect(service).toBeDefined();

    const createdTicket: Ticket = {
      ...baseTicket,
      title: 'Created from SSE',
      updatedAt: '2026-06-18T13:00:00.000Z',
    };
    service!.emitMessage({
      type: 'ticket.created',
      actorUserId: 'user-2',
      ticketKey: createdTicket.key,
      ticketId: createdTicket.id,
      projectId: createdTicket.projectId,
      data: { ticket: createdTicket },
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toHaveLength(1);
      expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))?.[0]).toMatchObject({
        id: 'ticket-1',
        title: 'Created from SSE',
        projectId: 'project-1',
      });
      expect(queryClient.getQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'))).toMatchObject({
        id: 'ticket-1',
        title: 'Created from SSE',
      });
    });

    const updatedTicket = {
      ...createdTicket,
      title: 'Updated from SSE',
      updatedAt: '2026-06-18T14:00:00.000Z',
    };
    service!.emitMessage({
      type: 'ticket.updated',
      actorUserId: 'user-2',
      ticketKey: updatedTicket.key,
      ticketId: updatedTicket.id,
      projectId: updatedTicket.projectId,
      data: { ticket: updatedTicket },
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))?.[0]?.title).toBe('Updated from SSE');
      expect(queryClient.getQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'))?.title).toBe('Updated from SSE');
    });

    service!.emitMessage({
      type: 'ticket.updated',
      actorUserId: 'user-1',
      ticketKey: updatedTicket.key,
      ticketId: updatedTicket.id,
      projectId: updatedTicket.projectId,
      data: { ticket: { ...updatedTicket, title: 'Ignored self update' } },
    });

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))?.[0]?.title).toBe('Updated from SSE');

    queryClient.setQueryData(queryKeys.comments('ticket-1'), [
      {
        id: 'comment-1',
        ticketId: 'ticket-1',
        userId: 'user-1',
        body: 'Looks good',
        createdAt: '2026-06-18T12:00:00.000Z',
        updatedAt: '2026-06-18T12:00:00.000Z',
      },
    ]);

    service!.emitMessage({
      type: 'ticket.deleted',
      actorUserId: 'user-2',
      ticketKey: updatedTicket.key,
      ticketId: updatedTicket.id,
      projectId: updatedTicket.projectId,
      data: { ticket: updatedTicket },
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toEqual([]);
      expect(queryClient.getQueryData<Ticket>(queryKeys.ticketDetail('ticket-1'))).toBeUndefined();
      expect(queryClient.getQueryData(queryKeys.comments('ticket-1'))).toBeUndefined();
    });
  });

  it('invalidates the active ticket comment cache and cleans up listeners on workspace change', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.tickets('project-1'), [] as Ticket[]);
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.stubGlobal('EventSource', class {});

    renderWithProviders(queryClient);

    await waitFor(() => {
      expect(currentProject).toBeDefined();
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-1');
    });

    await waitFor(() => {
      expect(currentRealtime.workspaceId).toBe('workspace-1');
    });

    await waitFor(() => {
      expect(currentActiveTicket).toBeDefined();
    });

    await act(async () => {
      currentActiveTicket!.setActiveTicket(baseTicket);
    });

    const service = serviceRegistry.get('workspace-1');
    expect(service).toBeDefined();

    service!.emitMessage({
      type: 'comments-updated',
      actorUserId: 'user-2',
      ticketId: baseTicket.id,
      projectId: baseTicket.projectId,
      data: { ticketId: baseTicket.id },
    });

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.comments(baseTicket.id) });
    });

    await act(async () => {
      currentProject!.setActiveProjectId('project-2');
    });

    await waitFor(() => {
      expect(currentRealtime.workspaceId).toBe('workspace-2');
      expect(getSseServiceMock).toHaveBeenCalledWith('workspace-2');
    });

    expect(service!.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(service!.disconnect).toHaveBeenCalledTimes(1);
    expect(disposeSseServiceMock).toHaveBeenCalledWith('workspace-1');
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.comments(baseTicket.id) });
  });
});
