import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceTeamProjectsPage } from '../../pages/WorkspaceTeamProjectsPage/WorkspaceTeamProjectsPage.tsx';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('@library', () => ({
  Button: ({ children, loading, ...props }: any) => (
    <button {...props}>{loading ? 'Loading' : children}</button>
  ),
  TextInput: ({ label, value, onChange, ...props }: any) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
  Textarea: ({ label, value, onChange, autoGrow, inputStyle, ...props }: any) => (
    <label>
      <span>{label}</span>
      <textarea value={value} onChange={onChange} {...props} />
    </label>
  ),
}));

vi.mock('../../modules/workspaces', () => ({
  WorkspaceHeader: Object.assign(
    ({ children }: any) => <header>{children}</header>,
    {
      Top: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h1>{children}</h1>,
    },
  ),
}));

vi.mock('../../modules/workspaces/components/ProjectCreateOverlay', () => ({
  ProjectCreateOverlay: ({ onClose, onSubmitProject }: any) => (
    <div>
      <div>ProjectCreateOverlay</div>
      <button
        type="button"
        onClick={() =>
          void onSubmitProject({
            name: '  Orbit UI  ',
            description: '  Delivery workspace  ',
            key: ' orb-1234 ',
          })
        }
      >
        Submit overlay project
      </button>
      <button type="button" onClick={onClose}>
        Close overlay
      </button>
    </div>
  ),
}));

const team = {
  id: 'team-engineering',
  name: 'Engineering',
  description: 'Builds the platform',
  color: '#3B82F6',
  views: [],
  cycles: [],
  domains: [],
  projects: [],
};

const projects = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    key: 'GRA',
    description: 'Primary project',
    status: 'active' as const,
    workspaceId: 'workspace-1',
    githubRepoUrl: 'https://github.com/gravity/core',
    teamId: 'team-engineering',
  },
  {
    id: 'project-2',
    name: 'Orbit UI',
    key: 'ORB',
    description: 'Front-end delivery',
    status: 'planned' as const,
    workspaceId: 'workspace-1',
    githubRepoUrl: null,
    teamId: 'team-engineering',
  },
];

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderWorkspaceTeamProjectsPage(overrides: Partial<Parameters<typeof WorkspaceTeamProjectsPage>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const props: Parameters<typeof WorkspaceTeamProjectsPage>[0] = {
    workspaceId: 'workspace-1',
    workspaceName: 'Gravity',
    team,
    projects,
    activeProjectId: 'project-1',
    loading: false,
    onBackToTeams: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue({
      id: 'project-3',
      name: 'Orbit UI',
      description: 'Delivery workspace',
      key: 'ORB1234',
      status: 'active',
      workspaceId: 'workspace-1',
      githubRepoUrl: null,
      teamId: 'team-engineering',
    }),
    onUpdateProject: vi.fn().mockResolvedValue(null),
    ...overrides,
  };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceTeamProjectsPage {...props} />
      </QueryClientProvider>
    ),
    props,
  };
}

describe('WorkspaceTeamProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a team-specific project manager and supports editing projects', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceTeamProjectsPage();

    expect(screen.getByText('Manage Team Projects')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gravity Core' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Team projects')).getByText('Primary project')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Orbit UI/i }));

    const editorPanel = screen.getByRole('region', { name: /project editor/i });
    const editorForm = screen.getByRole('form', { name: /project editor/i });
    expect(editorForm).toBeInTheDocument();
    await waitFor(() => {
      expect(within(editorPanel).getByRole('heading', { name: 'Orbit UI' })).toBeInTheDocument();
    });

    await user.clear(within(editorForm).getByLabelText('Project Name'));
    await user.type(within(editorForm).getByLabelText('Project Name'), 'Orbit UI Revamp');
    await user.clear(within(editorForm).getByLabelText('Description'));
    await user.type(within(editorForm).getByLabelText('Description'), 'Delivery workspace revamp');
    await user.clear(within(editorForm).getByLabelText('GitHub Repository URL'));
    await user.type(within(editorForm).getByLabelText('GitHub Repository URL'), 'https://github.com/gravity/orbit');
    await user.click(within(editorForm).getByRole('button', { name: 'Archived' }));
    await user.click(within(editorForm).getByRole('button', { name: 'Save Project' }));

    await waitFor(() => {
      expect(props.onUpdateProject).toHaveBeenCalledWith('project-2', {
        name: 'Orbit UI Revamp',
        description: 'Delivery workspace revamp',
        githubRepoUrl: 'https://github.com/gravity/orbit',
        status: 'completed',
      });
    });
  });

  it('opens a dedicated create overlay and scopes new projects to the team', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceTeamProjectsPage();

    await user.click(screen.getByRole('button', { name: 'New Project' }));
    expect(screen.getByText('ProjectCreateOverlay')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit overlay project' }));

    await waitFor(() => {
      expect(props.onCreateProject).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        teamId: 'team-engineering',
        name: 'Orbit UI',
        description: 'Delivery workspace',
        key: 'ORB1234',
        status: 'active',
      });
    });
  });
});
