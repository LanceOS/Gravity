import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceProjectsPage } from '../../pages/WorkspaceProjectsPage/WorkspaceProjectsPage.tsx';
import type { Project } from '../../context/TicketContext.tsx';

type WorkspaceProjectPanelMockProps = {
  workspaceName: string;
  activeProjectId: string | null;
  defaultProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => void | Promise<void>;
  onCreateDomain: (domain: { projectId: string; name: string; color: string }) => void | Promise<void>;
};

vi.mock('../../modules/workspaces', () => ({
  WorkspaceHeader: Object.assign(
    ({ children }: any) => <header>{children}</header>,
    {
      Top: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h1>{children}</h1>,
    }
  ),
  WorkspaceProjectPanel: ({
    workspaceName,
    activeProjectId,
    defaultProjectId,
    onSelectProject,
    onCreateProject,
    onCreateDomain,
  }: WorkspaceProjectPanelMockProps) => (
    <div>
      <div>{`WorkspaceProjectPanel ${workspaceName} ${activeProjectId} ${defaultProjectId}`}</div>
      <button type="button" onClick={() => onSelectProject('project-2')}>
        Select another project
      </button>
      <button
        type="button"
        onClick={() =>
          onCreateProject({
            name: 'Orbit UI',
            description: 'Delivery workspace',
            key: 'ORB',
          })
        }
      >
        Create project
      </button>
      <button
        type="button"
        onClick={() => onCreateDomain({ projectId: activeProjectId ?? 'project-1', name: 'Platform', color: '#3b82f6' })}
      >
        Create domain
      </button>
    </div>
  ),
}));

const projects: Project[] = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    key: 'GRA',
    description: 'Primary project',
    status: 'active',
    workspaceId: 'workspace-1',
  },
];

function renderWorkspaceProjectsPage(overrides: Partial<Parameters<typeof WorkspaceProjectsPage>[0]> = {}) {
  const baseProps: Parameters<typeof WorkspaceProjectsPage>[0] = {
    workspaceName: 'Gravity',
    projects,
    activeProjectId: 'project-1',
    defaultProjectId: 'project-1',
    domains: [],
    projectCreateLoading: false,
    projectCreateError: null,
    domainCreateLoading: false,
    domainCreateError: null,
    onBackToWorkspace: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue(undefined),
    onCreateDomain: vi.fn().mockResolvedValue(undefined),
    onSelectProject: vi.fn(),
  };

  const props = { ...baseProps, ...overrides };

  return {
    ...render(<WorkspaceProjectsPage {...props} />),
    props,
  };
}

describe('WorkspaceProjectsPage', () => {
  it('renders the project management wrapper and forwards actions to the panel', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceProjectsPage();

    expect(screen.getByText('Manage Projects')).toBeInTheDocument();
    expect(screen.getByText('WorkspaceProjectPanel Gravity project-1 project-1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Workspace' }));
    expect(props.onBackToWorkspace).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Select another project' }));
    expect(props.onSelectProject).toHaveBeenCalledWith('project-2');

    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(props.onCreateProject).toHaveBeenCalledWith({
      name: 'Orbit UI',
      description: 'Delivery workspace',
      key: 'ORB',
    });

    await user.click(screen.getByRole('button', { name: 'Create domain' }));
    expect(props.onCreateDomain).toHaveBeenCalledWith({
      projectId: 'project-1',
      name: 'Platform',
      color: '#3b82f6',
    });
  });
});