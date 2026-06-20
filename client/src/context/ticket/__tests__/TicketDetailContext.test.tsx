import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTicketDetailContextValue } from '../TicketDetailContext';
import type { TicketDetailContextType } from '../TicketDetailContext.types';
import type { Comment, Ticket } from '../../../types/domain';
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
    ...overrides,
  };
}

function makeTicketWithRelations(overrides: Partial<TicketWithRelations> = {}): TicketWithRelations {
  const ticket = makeTicket();

  return {
    ...ticket,
    relatedTicketIds: [],
    dependencies: [],
    blockers: [],
    blockedTicket: null,
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1',
    ticketId: 'ticket-1',
    userId: 'user-1',
    body: 'Looks good',
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:00:00.000Z',
    userName: 'Ada Lovelace',
    userAvatar: '',
    ...overrides,
  };
}

let currentValue: TicketDetailContextType;

function Probe({
  activeTicket,
  setActiveTicket,
  activeProjectId,
  tickets,
  isAuthenticated,
}: {
  activeTicket: Ticket | null;
  setActiveTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  activeProjectId: string;
  tickets: Ticket[];
  isAuthenticated: boolean;
}) {
  const value = useTicketDetailContextValue({
    activeTicket,
    setActiveTicket,
    activeProjectId,
    tickets,
    isAuthenticated,
  });

  React.useEffect(() => {
    currentValue = value;
  }, [value]);

  return null;
}

describe('TicketDetailContext', () => {
  afterEach(() => {
    currentValue = undefined as unknown as TicketDetailContextType;
    vi.unstubAllGlobals();
  });

  it('disables detail and comment queries when no active ticket is selected', async () => {
    const queryClient = createQueryClient();
    const fetchMock = vi.fn();
    const setActiveTicket = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe
          activeTicket={null}
          setActiveTicket={setActiveTicket}
          activeProjectId="project-1"
          tickets={[]}
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue).toBeDefined();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(currentValue.activeTicket).toBeNull();
    expect(currentValue.activeTicketId).toBeUndefined();
    expect(currentValue.activeTicketProjectId).toBe('project-1');
    expect(currentValue.activeTicketDetail).toBeNull();
    expect(currentValue.comments).toEqual([]);
  });

  it('keeps the previous detail and comments visible while swapping tickets and syncs live ticket updates', async () => {
    const queryClient = createQueryClient();
    const setActiveTicket = vi.fn();
    const activeTicket = makeTicket();
    const updatedActiveTicket = {
      ...activeTicket,
      title: 'Seed ticket updated',
      updatedAt: '2026-06-19T00:00:00.000Z',
    };
    const nextTicket = makeTicket({
      id: 'ticket-2',
      key: 'GRA-2',
      title: 'Next ticket',
    });
    const activeTicketDetail = makeTicketWithRelations({
      ...activeTicket,
      dependencies: [],
      blockers: [],
    });
    const nextTicketDetail = makeTicketWithRelations({
      ...nextTicket,
      dependencies: [],
      blockers: [],
    });
    const activeTicketComments = [makeComment()];
    const nextTicketComments = [
      makeComment({
        id: 'comment-2',
        ticketId: 'ticket-2',
        body: 'Second ticket comment',
      }),
    ];

    let resolveNextDetail!: (response: Response) => void;
    let resolveNextComments!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/v1/tickets/ticket-1' && method === 'GET') {
        return Promise.resolve(jsonResponse(activeTicketDetail));
      }

      if (url === '/api/v1/tickets/ticket-1/comments' && method === 'GET') {
        return Promise.resolve(jsonResponse(activeTicketComments));
      }

      if (url === '/api/v1/tickets/ticket-2' && method === 'GET') {
        return new Promise<Response>((resolve) => {
          resolveNextDetail = resolve;
        });
      }

      if (url === '/api/v1/tickets/ticket-2/comments' && method === 'GET') {
        return new Promise<Response>((resolve) => {
          resolveNextComments = resolve;
        });
      }

      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Probe
          activeTicket={activeTicket}
          setActiveTicket={setActiveTicket}
          activeProjectId="project-1"
          tickets={[activeTicket, nextTicket]}
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue.activeTicketDetail?.id).toBe('ticket-1');
      expect(currentValue.comments.map((comment) => comment.id)).toEqual(['comment-1']);
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <Probe
          activeTicket={activeTicket}
          setActiveTicket={setActiveTicket}
          activeProjectId="project-1"
          tickets={[updatedActiveTicket, nextTicket]}
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(setActiveTicket).toHaveBeenCalledWith(updatedActiveTicket);
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <Probe
          activeTicket={nextTicket}
          setActiveTicket={setActiveTicket}
          activeProjectId="project-1"
          tickets={[updatedActiveTicket, nextTicket]}
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue.activeTicketId).toBe('ticket-2');
    });

    expect(currentValue.activeTicketProjectId).toBe('project-1');
    expect(currentValue.activeTicketDetail?.id).toBe('ticket-1');
    expect(currentValue.comments.map((comment) => comment.id)).toEqual(['comment-1']);

    await waitFor(() => {
      expect(resolveNextDetail).toBeDefined();
      expect(resolveNextComments).toBeDefined();
    });

    resolveNextDetail(jsonResponse(nextTicketDetail));
    resolveNextComments(jsonResponse(nextTicketComments));

    await waitFor(() => {
      expect(currentValue.activeTicketDetail?.id).toBe('ticket-2');
      expect(currentValue.comments.map((comment) => comment.id)).toEqual(['comment-2']);
    });
  });

  it('clears stale detail and comments when the active ticket is deselected', async () => {
    const queryClient = createQueryClient();
    const setActiveTicket = vi.fn();
    const activeTicket = makeTicket();
    const activeTicketDetail = makeTicketWithRelations({
      ...activeTicket,
      dependencies: [],
      blockers: [],
    });
    const activeTicketComments = [makeComment()];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/v1/tickets/ticket-1' && method === 'GET') {
        return Promise.resolve(jsonResponse(activeTicketDetail));
      }

      if (url === '/api/v1/tickets/ticket-1/comments' && method === 'GET') {
        return Promise.resolve(jsonResponse(activeTicketComments));
      }

      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Probe
          activeTicket={activeTicket}
          setActiveTicket={setActiveTicket}
          activeProjectId="project-1"
          tickets={[activeTicket]}
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue.activeTicketDetail?.id).toBe('ticket-1');
      expect(currentValue.comments.map((comment) => comment.id)).toEqual(['comment-1']);
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <Probe
          activeTicket={null}
          setActiveTicket={setActiveTicket}
          activeProjectId="project-1"
          tickets={[activeTicket]}
          isAuthenticated
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue.activeTicket).toBeNull();
      expect(currentValue.activeTicketDetail).toBeNull();
      expect(currentValue.comments).toEqual([]);
    });
  });
});
