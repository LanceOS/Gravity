import type { ButtonHTMLAttributes, ChangeEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@library';
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
  toast: { show: vi.fn().mockReturnValue('saving-toast'), dismiss: vi.fn() },
  Button: ({ children, loading, ...props }: MockButtonProps) => <button {...props}>{loading ? 'Loading' : children}</button>,
  CircularColorInput: ({ label, value, onChange, ...props }: { label: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) => (
    <label>
      <span>{label}</span>
      <input type="color" value={value} onChange={onChange} {...props} />
    </label>
  ),
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
  ProjectCreateOverlay: ({ isOpen, onClose, onSubmitProject }: ProjectCreateOverlayProps) => isOpen ? (
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
  ) : null,
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
    vi.mocked(toast.show).mockReturnValue('saving-toast');
  });

  it('disables settings while saving and after success, and enables new edits', async () => {
    let resolveSave!: () => void;
    const onUpdateProject = vi.fn(() => new Promise<null>(resolve => { resolveSave = () => resolve(null); }));
    renderWorkspaceProjectPanel({ onUpdateProject });
    const save = screen.getByRole('button', { name: 'Save Settings' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('GitHub Repository URL'), { target: { value: 'https://github.com/owner/repo' } });
    expect(save).toBeEnabled();
    fireEvent.submit(save.closest('form')!);
    fireEvent.submit(save.closest('form')!);
    expect(onUpdateProject).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    expect(toast.show).toHaveBeenCalledWith('Saving project settings…', 'info', 0);
    await act(async () => resolveSave());
    expect(save).toBeDisabled();
    expect(screen.getByText('Project settings updated successfully.')).toBeInTheDocument();
    // Shared project mutations own result toasts; this layer owns only progress.
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledWith('saving-toast');
    fireEvent.submit(save.closest('form')!);
    expect(onUpdateProject).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('GitHub Repository URL'), { target: { value: 'https://github.com/owner/another' } });
    expect(save).toBeEnabled();
  });

  it('preserves the draft after an optimistic rollback and allows retry after failure', async () => {
    let rejectSave!: (error: Error) => void;
    const onUpdateProject = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; })).mockResolvedValue(null);
    const { props, rerender } = renderWorkspaceProjectPanel({ onUpdateProject });
    const input = screen.getByLabelText('GitHub Repository URL');
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    rerender(<WorkspaceProjectPanel {...props} projects={projects.map(p => p.id === 'project-1' ? { ...p, githubRepoUrl: 'https://github.com/owner/repo' } : p)} />);
    rerender(<WorkspaceProjectPanel {...props} projects={projects.map(p => ({ ...p }))} />);
    await act(async () => rejectSave(new Error('Unable to save settings.')));
    expect(input).toHaveValue('https://github.com/owner/repo');
    expect(screen.getByText('Unable to save settings.')).toBeInTheDocument();
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled());
    expect(onUpdateProject).toHaveBeenCalledTimes(2);
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

  it('keeps the project roster order stable after selecting a project', async () => {
    const user = userEvent.setup();
    renderWorkspaceProjectPanel();
    const projectRoster = screen.getByRole('region', { name: 'Workspace projects' });

    const getProjectNamesInOrder = () =>
      within(projectRoster)
        .getAllByRole('button')
        .map((button) => button.textContent || '')
        .filter((text) => text.includes('Gravity Core') || text.includes('Orbit Delivery'));

    expect(getProjectNamesInOrder()[0]).toContain('Gravity Core');
    expect(getProjectNamesInOrder()[1]).toContain('Orbit Delivery');

    await user.click(screen.getByRole('button', { name: /Orbit Delivery/ }));

    expect(getProjectNamesInOrder()[0]).toContain('Gravity Core');
    expect(getProjectNamesInOrder()[1]).toContain('Orbit Delivery');
    expect(screen.getByRole('heading', { name: 'Orbit Delivery labels' })).toBeInTheDocument();
  });

  it('opens a delete-confirmation modal and deletes a project after confirmation', async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceProjectPanel({ onDeleteProject, activeProjectId: 'project-1' });

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));

    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete Project' });
    expect(deleteDialog).toBeInTheDocument();
    expect(deleteDialog).toHaveTextContent('Are you sure you want to delete the project Gravity Core?');
    expect(deleteDialog).toHaveTextContent('This action is permanent and will delete all associated tickets and comments.');

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
    const dialog = screen.getByRole('alertdialog', { name: 'Delete label "Partner Ops"?' });
    expect(props.onDeleteLabel).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(props.onDeleteLabel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Label' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete Label' }));

    await waitFor(() => {
      expect(props.onDeleteLabel).toHaveBeenCalledWith('domain-2');
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

it('allows restoring a previously saved repository after a newer server update', async () => {
  const { props, rerender } = renderWorkspaceProjectPanel();
  const savedUrl = 'https://github.com/org/saved';
  fireEvent.change(screen.getByLabelText('GitHub Repository URL'), { target: { value: savedUrl } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save Settings' }).closest('form')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled());
  rerender(<WorkspaceProjectPanel {...props} projects={projects.map(project => project.id === 'project-1' ? { ...project, githubRepoUrl: savedUrl } : project)} />);
  rerender(<WorkspaceProjectPanel {...props} projects={projects.map(project => project.id === 'project-1' ? { ...project, githubRepoUrl: 'https://github.com/org/newer' } : project)} />);
  fireEvent.change(screen.getByLabelText('GitHub Repository URL'), { target: { value: savedUrl } });
  expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
});

it('allows restoring a previously saved label after a newer server update', async () => {
  const user = userEvent.setup();
  const label = { id: 'restore-label', projectId: 'project-1', name: 'Original', color: '#f97316', description: '', sortOrder: 0 };
  const { props, rerender } = renderWorkspaceProjectPanel({ labels: [label] });
  await user.click(screen.getByRole('button', { name: 'Original' }));
  fireEvent.change(screen.getAllByLabelText('Label Name')[0], { target: { value: 'Saved' } });
  await user.click(screen.getByRole('button', { name: 'Save Label' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Label' })).toBeDisabled());
  rerender(<WorkspaceProjectPanel {...props} labels={[{ ...label, name: 'Saved' }]} />);
  rerender(<WorkspaceProjectPanel {...props} labels={[{ ...label, name: 'Newer' }]} />);
  fireEvent.change(screen.getAllByLabelText('Label Name')[0], { target: { value: 'Saved' } });
  expect(screen.getByRole('button', { name: 'Save Label' })).toBeEnabled();
});
