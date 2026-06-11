import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mocks = vi.hoisted(() => ({
  useTickets: vi.fn(),
}));

vi.mock('../../context/TicketContext', () => ({
  useTickets: mocks.useTickets,
}));

import { useTicketByKey } from '../../hooks/useTicketByKey.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useTicketByKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not reuse cached ticket details across different authenticated users', async () => {
    const ticketKey = 'SEC-401';
    const owner = {
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
      avatar: '',
      role: 'owner',
    };
    const member = {
      id: 'member-2',
      name: 'Member',
      email: 'member@example.com',
      avatar: '',
      role: 'member',
    };
    const ticket = {
      id: 'ticket-1',
      key: ticketKey,
      title: 'Restricted ticket',
    };

    let ticketsState = {
      tickets: [],
      ticketMap: new Map<string, never>(),
      currentUser: owner,
    };

    mocks.useTickets.mockImplementation(() => ticketsState);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(ticket))
      .mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403));

    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(() => useTicketByKey(ticketKey), { wrapper });

    await waitFor(() => {
      console.log('DEBUG: result.current =', result.current);
      expect(result.current.ticketInfo).toEqual(ticket);
      expect(result.current.error).toBeNull();
    });

    ticketsState = {
      tickets: [],
      ticketMap: new Map<string, never>(),
      currentUser: member,
    };

    rerender();

    await waitFor(() => {
      expect(result.current.ticketInfo).toBeNull();
      expect(result.current.error?.message).toBe('Forbidden');
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/v1/tickets/key/${ticketKey}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': owner.id,
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/tickets/key/${ticketKey}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': member.id,
      },
    });
  });
});