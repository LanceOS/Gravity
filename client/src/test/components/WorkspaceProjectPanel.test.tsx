import type { ButtonHTMLAttributes, ChangeEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceProjectPanel } from '../../modules/workspaces';
import type {
  ProjectCreateOverlayProps,
} from '../../modules/workspaces/types/WorkspaceProjectPanel';

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

type MockTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
};

vi.mock('@library', () => ({
  Button: ({ children, loading, ...props }: MockButtonProps) => <button {...props}>{loading ? 'Loading' : children}</button>,
  TextInput: ({ label, value, onChange, ...props }: MockTextInputProps) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
  Textarea: ({ label, value, onChange, ...props }: MockTextareaProps) => (
    <label>
      <span>{label}</span>
      <textarea value={value} onChange={onChange} {...props} />
    </label>
  ),
}));

vi.mock('../../components/WorkspaceProjectPanel', () => ({
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
    labels: [
      {
        id: 'domain-1',
        projectId: 'project-1',
        name: 'Platform',
        color: '#10b981',
        description: '',
        sortOrder: 0,
      },
    ],
    projectCreateLoading: false,
    projectCreateError: null,
    labelCreateLoading: false,
    labelCreateError: null,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue(undefined),
    onUpdateProject: vi.fn().mockResolvedValue(null),
    onCreateLabel: vi.fn().mockResolvedValue(undefined),
    onUpdateLabel: vi.fn().mockResolvedValue(undefined),
    onDeleteLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<WorkspaceProjectPanel {...props} />),
    props,
  };
}

describe('WorkspaceProjectPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders the project management hero, roster, and editor', async () => {
    renderWorkspaceProjectPanel();

    expect(screen.getByRole('heading', { name: 'Gravity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workspace projects' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gravity Core' })).toBeInTheDocument();
    expect(screen.getByText('GRA')).toBeInTheDocument();
    expect(screen.getByText('Primary project')).toBeInTheDocument();
    expect(screen.getAllByText('Default project').length).toBeGreaterThan(0);
    expect(screen.getByText('Platform')).toBeInTheDocument();
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

  it('selects a managed project and creates a label with description and sort order', async () => {
    const user = userEvent.setup();
    const orbitLabels = [
      {
        id: 'domain-2',
        projectId: 'project-2',
        name: 'Partner Ops',
        color: '#f97316',
        description: '',
        sortOrder: 0,
      },
    ];
    const { props, rerender } = renderWorkspaceProjectPanel();

    await user.click(screen.getByRole('button', { name: /Orbit Delivery/ }));
    expect(props.onSelectProject).toHaveBeenCalledWith('project-2');

    rerender(
      <WorkspaceProjectPanel
        workspaceName="Gravity"
        projects={projects}
        activeProjectId="project-2"
        defaultProjectId="project-1"
        labels={orbitLabels}
        projectCreateLoading={false}
        projectCreateError={null}
        labelCreateLoading={false}
        labelCreateError={null}
        onSelectProject={props.onSelectProject}
        onCreateProject={props.onCreateProject}
        onUpdateProject={props.onUpdateProject}
        onCreateLabel={props.onCreateLabel}
        onUpdateLabel={props.onUpdateLabel}
        onDeleteLabel={props.onDeleteLabel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Orbit Delivery labels')).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('Label Name'));
    await user.type(screen.getByLabelText('Label Name'), '  Payments  ');
    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), '  Handles billing and collection flows.  ');

    const colorInputs = screen.getAllByDisplayValue('#3b82f6');
    expect(colorInputs.length).toBeGreaterThan(0);
    fireEvent.change(colorInputs[0] as HTMLInputElement, { target: { value: '#ff0000' } });

    await user.click(screen.getByRole('button', { name: 'Create Label' }));

    await waitFor(() => {
      expect(props.onCreateLabel).toHaveBeenCalledWith({
        projectId: 'project-2',
        name: 'Payments',
        color: '#ff0000',
        description: 'Handles billing and collection flows.',
        sortOrder: 1,
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Label Name')).toHaveValue('');
      expect(screen.getByLabelText('Description')).toHaveValue('');
    });
  });

  it('opens a delete-confirmation modal and deletes a project after confirmation', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceProjectPanel({ onDeleteProject, activeProjectId: 'project-1' });

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));

    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete Project' });
    expect(deleteDialog).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete the project Gravity Core?')).toBeInTheDocument();
    expect(screen.getByText('This action is permanent and will delete all associated tickets and comments.')).toBeInTheDocument();

    const confirmButton = within(deleteDialog).getByRole('button', { name: 'Delete Project' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(onDeleteProject).toHaveBeenCalledWith('project-1');
    });

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Delete Project' })).not.toBeInTheDocument();
    });
  });

  it('cancels project deletion without calling the API', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceProjectPanel({ onDeleteProject, activeProjectId: 'project-1' });

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));

    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete Project' });
    expect(deleteDialog).toBeInTheDocument();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(onDeleteProject).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole('alertdialog', { name: 'Delete Project' })).not.toBeInTheDocument();
  });

  it('does not show project deletion controls when delete action is unavailable', () => {
    renderWorkspaceProjectPanel();

    expect(screen.queryByRole('button', { name: 'Delete Project' })).not.toBeInTheDocument();
  });

  it('opens a label editor, saves updates, and deletes the label', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const orbitLabels = [
      {
        id: 'domain-2',
        projectId: 'project-2',
        name: 'Partner Ops',
        color: '#f97316',
        description: 'Ops work',
        sortOrder: 0,
      },
    ];
    const { props, rerender } = renderWorkspaceProjectPanel({ activeProjectId: 'project-2', labels: orbitLabels });

    await waitFor(() => {
      expect(screen.getByText('Orbit Delivery labels')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Partner Ops' }));

    expect(screen.getByRole('heading', { name: 'Partner Ops' })).toBeInTheDocument();

    const [editorNameInput] = screen.getAllByLabelText('Label Name');
    const [editorDescriptionInput] = screen.getAllByLabelText('Description');
    const colorInputs = screen.getAllByDisplayValue('#f97316');

    await user.clear(editorNameInput);
    await user.type(editorNameInput, 'Partner Success');
    await user.clear(editorDescriptionInput);
    await user.type(editorDescriptionInput, 'Updated ops label');
    fireEvent.change(colorInputs[0] as HTMLInputElement, { target: { value: '#2563eb' } });

    await user.click(screen.getByRole('button', { name: 'Save Label' }));

    await waitFor(() => {
      expect(props.onUpdateLabel).toHaveBeenCalledWith('domain-2', {
        name: 'Partner Success',
        color: '#2563eb',
        description: 'Updated ops label',
      });
    });

    rerender(
      <WorkspaceProjectPanel
        workspaceName="Gravity"
        projects={projects}
        activeProjectId="project-2"
        defaultProjectId="project-1"
        labels={orbitLabels}
        projectCreateLoading={false}
        projectCreateError={null}
        labelCreateLoading={false}
        labelCreateError={null}
        onSelectProject={props.onSelectProject}
        onCreateProject={props.onCreateProject}
        onUpdateProject={props.onUpdateProject}
        onCreateLabel={props.onCreateLabel}
        onUpdateLabel={props.onUpdateLabel}
        onDeleteLabel={props.onDeleteLabel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Partner Ops' }));
    await user.click(screen.getByRole('button', { name: 'Delete Label' }));

    await waitFor(() => {
      expect(props.onDeleteLabel).toHaveBeenCalledWith('domain-2');
      expect(confirmSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Delete Label' })).not.toBeInTheDocument();
    });
  });

  it('scopes labels to the managed project and clears label selection when project changes', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderWorkspaceProjectPanel({
      activeProjectId: 'project-1',
      labels: [
        {
          id: 'domain-1',
          projectId: 'project-1',
          name: 'Shared',
          color: '#10b981',
          description: '',
          sortOrder: 0,
        },
        {
          id: 'domain-2',
          projectId: 'project-2',
          name: 'Shared',
          color: '#ef4444',
          description: '',
          sortOrder: 0,
        },
      ],
    });

    const [project1SharedLabel] = screen.getAllByRole('button', { name: 'Shared' });
    await user.click(project1SharedLabel);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Shared' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save Label' })).toBeInTheDocument();
    });

    rerender(
      <WorkspaceProjectPanel
        workspaceName="Gravity"
        projects={projects}
        activeProjectId="project-2"
        defaultProjectId="project-1"
        labels={[
          {
            id: 'domain-1',
            projectId: 'project-1',
            name: 'Shared',
            color: '#10b981',
            description: '',
            sortOrder: 0,
          },
          {
            id: 'domain-2',
            projectId: 'project-2',
            name: 'Shared',
            color: '#ef4444',
            description: '',
            sortOrder: 0,
          },
        ]}
        projectCreateLoading={false}
        projectCreateError={null}
        labelCreateLoading={false}
        labelCreateError={null}
        onSelectProject={props.onSelectProject}
        onCreateProject={props.onCreateProject}
        onUpdateProject={props.onUpdateProject}
        onCreateLabel={props.onCreateLabel}
        onUpdateLabel={props.onUpdateLabel}
        onDeleteLabel={props.onDeleteLabel}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Orbit Delivery labels' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Shared' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Shared' })).toHaveLength(1);
    });
  });
});
