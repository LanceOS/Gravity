import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { WorkspaceProjectsListPage } from '../../pages/WorkspaceProjectsListPage/WorkspaceProjectsListPage.tsx';

const mocks = vi.hoisted(() => ({
  useTickets: vi.fn(),
}));

vi.mock('../../context/TicketContext', () => ({
  useTickets: mocks.useTickets,
}));

vi.mock('../../modules/workspaces', () => ({
  PROJECT_STATUS_LABELS: {
    planned: 'Planned',
    active: 'Active',
    completed: 'Archived',
  },
  WorkspaceHeader: Object.assign(
    ({ children }: { children?: ReactNode }) => <header>{children}</header>,
    {
      Top: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      Title: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
    }
  ),
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

function renderWorkspaceProjectsListPage(overrides: Partial<Record<string, unknown>> = {}) {
  mocks.useTickets.mockReturnValue({
    activeProjectId: 'project-1',
    projects: [
      {
        id: 'project-1',
        name: 'Gravity Core',
        key: 'GRA',
        description: 'Primary project',
        status: 'active',
        workspaceId: 'workspace-1',
      },
      {
        id: 'project-2',
        name: 'Other Workspace Project',
        key: 'OWP',
        description: 'Should be filtered out',
        status: 'planned',
        workspaceId: 'workspace-2',
      },
    ],
    setActiveProjectId: vi.fn(),
    setActiveTicket: vi.fn(),
    ...overrides,
  });

  return {
    ...render(
      <MemoryRouter initialEntries={['/workspaces/workspace-1/projects/list']}>
        <LocationDisplay />
        <Routes>
          <Route path="/workspaces/:workspaceId/projects/list" element={<WorkspaceProjectsListPage />} />
        </Routes>
      </MemoryRouter>
    ),
  };
}

describe('WorkspaceProjectsListPage', () => {
  it('filters projects to the active workspace and navigates when a row is clicked', async () => {
    const user = userEvent.setup();
    renderWorkspaceProjectsListPage();

    expect(screen.getByText('Workspace Projects')).toBeInTheDocument();
    expect(screen.getByText('Gravity Core')).toBeInTheDocument();
    expect(screen.queryByText('Other Workspace Project')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Gravity Core/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/workspaces/workspace-1/projects/project-1/tickets'
      );
    });
  });

  it('shows an empty state when the workspace has no projects', () => {
    renderWorkspaceProjectsListPage({
      activeProjectId: '',
      projects: [
        {
          id: 'project-2',
          name: 'Elsewhere',
          key: 'ELS',
          description: '',
          status: 'planned',
          workspaceId: 'workspace-2',
        },
      ],
    });

    expect(screen.getByText('No projects in this workspace yet')).toBeInTheDocument();
  });
});
