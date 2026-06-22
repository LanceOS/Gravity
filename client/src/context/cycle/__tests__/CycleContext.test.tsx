import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../auth/AuthContext';
import { CycleProvider, useCycles } from '../CycleContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('../../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

let mockActiveProjectId = '';
vi.mock('../../project/ActiveProjectContext', () => ({
  useActiveProject: () => ({
    activeProjectId: mockActiveProjectId,
    setActiveProjectId: vi.fn(),
    activeProjectIdRef: { current: mockActiveProjectId },
  }),
}));

function renderWithProvider(ui: React.ReactNode, activeProjectId: string) {
  mockActiveProjectId = activeProjectId;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  
  return render(
    <QueryClientProvider client={queryClient}>
      <CycleProvider>
        {ui}
      </CycleProvider>
    </QueryClientProvider>
  );
}

function ContextProbe() {
  const { cycles, isLoading, error } = useCycles();

  return (
    <div>
      <div data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="error-state">{error ? 'error' : 'none'}</div>
      <div data-testid="cycle-count">{cycles.length}</div>
      <div data-testid="cycle-names">{cycles.map((c) => c.name).join(',')}</div>
    </div>
  );
}

describe('CycleContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches cycles for the active project', async () => {
    const user = {
      id: 'user-session-1',
    };
    vi.mocked(useAuth).mockReturnValue({
      currentUser: user as any,
      loading: false,
      isAuthenticated: true,
      signOut: vi.fn(),
    } as any);

    const fetchMock = vi.fn((url) => {
      if (url.includes('/cycles')) {
        return Promise.resolve(jsonResponse([
          { id: 'cycle-1', name: 'Cycle 1' },
          { id: 'cycle-2', name: 'Cycle 2' },
        ]));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(<ContextProbe />, 'project-1');

    expect(screen.getByTestId('loading-state')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('cycle-count')).toHaveTextContent('2');
    expect(screen.getByTestId('cycle-names')).toHaveTextContent('Cycle 1,Cycle 2');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/cycles'), expect.any(Object));
  });

  it('does not fetch cycles if no active project', async () => {
    const user = {
      id: 'user-session-1',
    };
    vi.mocked(useAuth).mockReturnValue({
      currentUser: user as any,
      loading: false,
      isAuthenticated: true,
      signOut: vi.fn(),
    } as any);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(<ContextProbe />, '');

    await waitFor(() => {
      expect(screen.getByTestId('cycle-count')).toHaveTextContent('0');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
