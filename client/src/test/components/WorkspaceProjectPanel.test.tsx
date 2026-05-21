import type { ButtonHTMLAttributes, ChangeEvent, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceProjectPanel } from '../../components/WorkspaceProjectPanel/WorkspaceProjectPanel.tsx';
import type {
  ProjectCreateOverlayProps,
  ProjectSelectionRailProps,
} from '../../components/WorkspaceProjectPanel/types';

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  loading?: boolean;
};

type MockTextInputProps = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

vi.mock('@library', () => ({
  Button: ({ children, loading, ...props }: MockButtonProps) => <button {...props}>{loading ? 'Loading' : children}</button>,
  TextInput: ({ label, value, onChange, ...props }: MockTextInputProps) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
}));

vi.mock('../../components/WorkspaceProjectPanel/components', () => ({
  ProjectCreateOverlay: ({ onClose, onSubmitProject }: ProjectCreateOverlayProps) => (
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
  ProjectSelectionRail: ({ selectedProjectId, onSelectProject }: ProjectSelectionRailProps) => (
    <div>
      <div>{`ProjectSelectionRail ${selectedProjectId ?? 'none'}`}</div>
      <button type="button" onClick={() => onSelectProject('project-2')}>
        Manage Orbit
      </button>
    </div>
  ),
}));

const projects = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    key: 'GRA',
    description: 'Primary project',
    status: 'active' as const,
    workspaceId: 'workspace-1',
  },
  {
    id: 'project-2',
    name: 'Orbit Delivery',
    key: 'ORB',
    description: 'Partner rollout',
    status: 'planned' as const,
    workspaceId: 'workspace-1',
  },
];

function renderWorkspaceProjectPanel(
  overrides: Partial<Parameters<typeof WorkspaceProjectPanel>[0]> = {}
) {
  const props = {
    workspaceName: 'Gravity',
    projects,
    activeProjectId: 'project-1',
    defaultProjectId: 'project-1',
    domains: [
      {
        id: 'domain-1',
        projectId: 'project-1',
        name: 'Platform',
        color: '#10b981',
      },
    ],
    projectCreateLoading: false,
    projectCreateError: null,
    domainCreateLoading: false,
    domainCreateError: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue(undefined),
    onCreateDomain: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<WorkspaceProjectPanel {...props} />),
    props,
  };
}

describe('WorkspaceProjectPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current project summary and the selection rail', async () => {
    renderWorkspaceProjectPanel();

    expect(screen.getByText('Workspace Projects')).toBeInTheDocument();
    expect(screen.getByText('Gravity')).toBeInTheDocument();
    expect(screen.getByText('GRA')).toBeInTheDocument();
    expect(screen.getByText('Primary project')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('ProjectSelectionRail project-1')).toBeInTheDocument();
    });
  });

  it('opens the create overlay only after clicking New Project, sanitizes the payload, and closes after a successful project creation', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceProjectPanel({ projects: [] });

    expect(screen.getByText('No projects in this workspace yet')).toBeInTheDocument();
    expect(screen.queryByText('ProjectCreateOverlay')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New Project' }));

    expect(screen.getByText('ProjectCreateOverlay')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit overlay project' }));

    await waitFor(() => {
      expect(props.onCreateProject).toHaveBeenCalledWith({
        name: 'Orbit UI',
        description: 'Delivery workspace',
        key: 'ORB1234',
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('ProjectCreateOverlay')).not.toBeInTheDocument();
    });
  });

  it('selects a managed project and creates a domain for that project', async () => {
    const user = userEvent.setup();
    const orbitDomains = [
      {
        id: 'domain-2',
        projectId: 'project-2',
        name: 'Partner Ops',
        color: '#f97316',
      },
    ];
    const { props, rerender, container } = renderWorkspaceProjectPanel();

    await waitFor(() => {
      expect(screen.getByText('ProjectSelectionRail project-1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Manage Orbit' }));
    expect(props.onSelectProject).toHaveBeenCalledWith('project-2');

    rerender(
      <WorkspaceProjectPanel
        workspaceName="Gravity"
        projects={projects}
        activeProjectId="project-2"
        defaultProjectId="project-1"
        domains={orbitDomains}
        projectCreateLoading={false}
        projectCreateError={null}
        domainCreateLoading={false}
        domainCreateError={null}
        onSelectProject={props.onSelectProject}
        onCreateProject={props.onCreateProject}
        onCreateDomain={props.onCreateDomain}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Orbit Delivery domains')).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('Domain Name'));
    await user.type(screen.getByLabelText('Domain Name'), '  Payments  ');
    const colorInput = container.querySelector('input[type="color"]');
    expect(colorInput).not.toBeNull();
    fireEvent.change(colorInput as HTMLInputElement, { target: { value: '#ff0000' } });
    await user.click(screen.getByRole('button', { name: 'Create Domain' }));

    await waitFor(() => {
      expect(props.onCreateDomain).toHaveBeenCalledWith({
        projectId: 'project-2',
        name: 'Payments',
        color: '#ff0000',
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Domain Name')).toHaveValue('');
      expect(colorInput).toHaveValue('#3b82f6');
    });
  });
});