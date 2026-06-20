import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '../../auth/authClient';
import { LabelProvider, useLabels } from '../LabelContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('../../auth/authClient', () => ({
  authClient: {
    useSession: vi.fn(),
  },
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
      <LabelProvider>
        {ui}
      </LabelProvider>
    </QueryClientProvider>
  );
}

function ContextProbe() {
  const { labels, globalLabels, labelsByProject, createLabel, assignLabelToTicket } = useLabels();

  return (
    <div>
      <div data-testid="label-count">{labels.length}</div>
      <div data-testid="global-count">{globalLabels.length}</div>
      <div data-testid="project-1-count">{labelsByProject.get('project-1')?.length || 0}</div>
      <button 
        data-testid="create-label-btn" 
        onClick={() => createLabel({ name: 'Bug', projectId: 'project-1' })}
      >
        Create Label
      </button>
      <button 
        data-testid="assign-label-btn" 
        onClick={() => assignLabelToTicket('ticket-1', 'label-1')}
      >
        Assign Label
      </button>
    </div>
  );
}

describe('LabelContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches labels and builds derived maps correctly', async () => {
    const user = { id: 'user-session-1' };
    vi.mocked(authClient.useSession).mockReturnValue({ data: { user } } as any);

    const fetchMock = vi.fn((url) => {
      if (url.includes('/labels')) {
        return Promise.resolve(jsonResponse([
          { id: 'label-1', name: 'Global Label', projectId: null },
          { id: 'label-2', name: 'Project Label', projectId: 'project-1' },
        ]));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(<ContextProbe />, 'project-1');

    await waitFor(() => {
      expect(screen.getByTestId('label-count')).toHaveTextContent('2');
    });

    expect(screen.getByTestId('global-count')).toHaveTextContent('1');
    expect(screen.getByTestId('project-1-count')).toHaveTextContent('1');
  });

  it('provides label crud functions', async () => {
    const user = { id: 'user-session-1' };
    vi.mocked(authClient.useSession).mockReturnValue({ data: { user } } as any);

    const fetchMock = vi.fn((url, init) => {
      if (url.includes('/labels') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ id: 'label-3', name: 'Bug', projectId: 'project-1', sortOrder: 0 }));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(<ContextProbe />, 'project-1');

    await waitFor(() => {
      expect(screen.getByTestId('label-count')).toHaveTextContent('0');
    });

    fireEvent.click(screen.getByTestId('create-label-btn'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/labels', expect.objectContaining({
        method: 'POST'
      }));
    });
  });
});
