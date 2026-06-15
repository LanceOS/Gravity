import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceTeamsPage } from '../../modules/workspaceTeamsPage/screens/WorkspaceTeamsPage.tsx';
import type { SidebarTeam, SidebarTree } from '../../types/domain.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../utils/apiClient', () => ({
  apiClient: apiMocks,
}));

vi.mock('../../modules/workspaces', () => ({
  WorkspaceHeader: Object.assign(
    ({ children }: any) => <header>{children}</header>,
    {
      Top: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h1>{children}</h1>,
    }
  ),
}));

const teams: SidebarTeam[] = [
  {
    id: 'team-engineering',
    name: 'Engineering',
    description: 'Builds the product platform',
    color: '#3B82F6',
    views: [],
    cycles: [{ id: 'cycle-1', name: 'Sprint 1', startDate: '', endDate: '', completed: 0 }],
    labels: [{ id: 'label-1', name: 'Platform', color: '#10B981' }],
    projects: [
      {
        id: 'project-1',
        name: 'Gravity Core',
        key: 'GRA',
        description: '',
        status: 'active',
        workspaceId: 'workspace-1',
      },
    ],
  },
  {
    id: 'team-design',
    name: 'Design',
    description: '',
    color: '#EC4899',
    views: [],
    cycles: [],
    labels: [],
    projects: [],
  },
];

function renderWorkspaceTeamsPage(overrides: Partial<Parameters<typeof WorkspaceTeamsPage>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const props: Parameters<typeof WorkspaceTeamsPage>[0] = {
    workspaceId: 'workspace-1',
    workspaceName: 'Gravity',
    teams,
    onBackToWorkspace: vi.fn(),
    onManageProjects: vi.fn(),
    onTeamsChanged: vi.fn(),
    ...overrides,
  };
  const initialSidebarTree: SidebarTree = {
    workspaceId: props.workspaceId,
    hierarchyMode: 'teams',
    teams: props.teams,
  };
  queryClient.setQueryData(['sidebarTree', props.workspaceId], initialSidebarTree);

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceTeamsPage {...props} />
      </QueryClientProvider>
    ),
    queryClient,
    props,
  };
}

describe('WorkspaceTeamsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.post.mockResolvedValue({});
    apiMocks.patch.mockResolvedValue({});
    apiMocks.delete.mockResolvedValue({});
  });

  it('renders a team-focused management page', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceTeamsPage();

    expect(screen.getByText('Manage Teams')).toBeInTheDocument();
    expect(screen.getByText('Team workspace')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Engineering/ }));
    expect(screen.getByText('GRA · Gravity Core')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Manage Projects' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Back to Workspace' }));
    expect(props.onBackToWorkspace).toHaveBeenCalledTimes(1);
  });

  it('prompts the owner to create the first team when none exist', () => {
    renderWorkspaceTeamsPage({ teams: [] });

    expect(screen.getByText('Create your first team to get started.')).toBeInTheDocument();
  });

  it('creates, updates, and deletes teams through team APIs', async () => {
    const user = userEvent.setup();
    const { props, queryClient } = renderWorkspaceTeamsPage();

    apiMocks.post.mockResolvedValueOnce({
      id: 'team-support',
      workspaceId: 'workspace-1',
      name: 'Support',
      description: 'Customer escalation team',
      color: '#3B82F6',
    });

    // Create a new team via Modal
    await user.click(screen.getByRole('button', { name: 'New Team' }));
    
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Team Name'), 'Support');
    await user.type(within(dialog).getByLabelText('Description'), 'Customer escalation team');
    await user.click(within(dialog).getByRole('button', { name: 'Create Team' }));

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith('/teams', {
        workspaceId: 'workspace-1',
        name: 'Support',
        description: 'Customer escalation team',
        color: '#3B82F6',
      });
    });

    // Update the selected team (Select Engineering explicitly)
    await user.click(screen.getByRole('button', { name: /Engineering/ }));

    apiMocks.patch.mockResolvedValueOnce({
      id: 'team-engineering',
      workspaceId: 'workspace-1',
      name: 'Core Engineering',
      description: 'Updated product platform ownership',
      color: '#F97316',
    });

    await user.clear(screen.getByLabelText('Team name'));
    await user.type(screen.getByLabelText('Team name'), 'Core Engineering');
    await user.clear(screen.getByLabelText('Team description'));
    await user.type(screen.getByLabelText('Team description'), 'Updated product platform ownership');
    await user.click(screen.getByRole('button', { name: 'Use team color #F97316' }));
    await user.click(screen.getByRole('button', { name: 'Save Team' }));

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith('/teams/team-engineering', {
        name: 'Core Engineering',
        description: 'Updated product platform ownership',
        color: '#F97316',
      });
    });

    await waitFor(() => {
      const sidebarTree = queryClient.getQueryData<SidebarTree>(['sidebarTree', 'workspace-1']);
      expect(sidebarTree?.teams.find((team) => team.id === 'team-engineering')).toMatchObject({
        name: 'Core Engineering',
        description: 'Updated product platform ownership',
        color: '#F97316',
      });
    });

    // Delete the selected team
    await user.click(screen.getByRole('button', { name: 'Reassign owned work before delete' }));
    await user.click(screen.getByRole('option', { name: 'Design' }));
    await user.click(screen.getByRole('button', { name: 'Delete Team' }));

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith('/teams/team-engineering', {
        params: { reassignTeamId: 'team-design' },
      });
      expect(props.onTeamsChanged).toHaveBeenCalled();
    });
  });

  it('navigates to team project management from the team card', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceTeamsPage();

    // Select Engineering explicitly
    await user.click(screen.getByRole('button', { name: /Engineering/ }));
    await user.click(screen.getByRole('button', { name: 'Manage Projects' }));

    expect(props.onManageProjects).toHaveBeenCalledWith('team-engineering');
  });

  it('allows deleting the last team without reassignment', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceTeamsPage({
      teams: [teams[0]],
    });

    expect(
      screen.getByText('This is the last team in the workspace. Deleting it will permanently remove its projects and related work.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reassign owned work before delete/i })).not.toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: 'Delete Team' });
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith('/teams/team-engineering');
      expect(props.onTeamsChanged).toHaveBeenCalled();
    });
  });
});
