import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Save, Trash } from 'lucide-react';
import { Button, TextInput, Textarea } from '@library';
import { PROJECT_LIFECYCLE_OPTIONS } from '../../workspaceProjectsPanel/utils/WorkspaceProjectPanel';
import type { Project } from '../../../types/domain';
import type { WorkspaceTeamProjectsPanelDraft } from '../types/WorkspaceTeamProjectsPanel';

interface WorkspaceTeamProjectsEditorSectionProps {
  selectedProject: Project | null;
  projectDraft: WorkspaceTeamProjectsPanelDraft;
  workspaceName: string;
  teamName: string;
  savingProjectId: string;
  deletingProjectId: string;
  isDeleteEnabled: boolean;
  onDraftChange: Dispatch<SetStateAction<WorkspaceTeamProjectsPanelDraft>>;
  onResetDraft: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteProject?: () => void;
}

export function WorkspaceTeamProjectsEditorSection({
  selectedProject,
  projectDraft,
  workspaceName,
  teamName,
  savingProjectId,
  deletingProjectId,
  isDeleteEnabled,
  onDraftChange,
  onResetDraft,
  onSubmit,
  onDeleteProject,
}: WorkspaceTeamProjectsEditorSectionProps) {
  if (!selectedProject) {
    return (
      <section className="workspace-team-projects-page__editor-card" aria-label="Project editor">
        <div className="workspace-team-projects-page__empty">
          <div className="workspace-team-projects-page__empty-title">No project selected</div>
          <p>Select a project or create the first one for {teamName}.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-team-projects-page__editor-card" aria-label="Project editor">
      <div className="workspace-team-projects-page__section-header">
        <div>
          <div className="workspace-team-projects-page__section-kicker">Project editor</div>
          <h3>{selectedProject.name}</h3>
        </div>
        <p>Update the project details that shape how this team ships work.</p>
      </div>

      <form className="workspace-team-projects-page__form" aria-label="Project editor" onSubmit={onSubmit}>
        <div className="workspace-team-projects-page__form-fields">
          <div className="workspace-team-projects-page__field-grid">
            <TextInput
              label="Project Name"
              value={projectDraft.name}
              onChange={(event) => onDraftChange((draft) => ({ ...draft, name: event.target.value }))}
              placeholder="Core Platform"
              required
            />

            <TextInput
              label="GitHub Repository URL"
              value={projectDraft.githubRepoUrl}
              onChange={(event) => onDraftChange((draft) => ({ ...draft, githubRepoUrl: event.target.value }))}
              placeholder="https://github.com/owner/repo"
            />
          </div>

          <Textarea
            label="Description"
            value={projectDraft.description}
            onChange={(event) => onDraftChange((draft) => ({ ...draft, description: event.target.value }))}
            placeholder="Describe what this project owns."
            className="workspace-team-projects-page__description-field"
            autoGrow={false}
            inputStyle={{ resize: 'none' }}
          />

          <div className="workspace-team-projects-page__status-group" aria-label="Project status">
            {PROJECT_LIFECYCLE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={projectDraft.status === option.value ? 'primary' : 'secondary'}
                onClick={() => onDraftChange((draft) => ({ ...draft, status: option.value as Project['status'] }))}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="workspace-team-projects-page__meta">
            <span className="workspace-team-projects-page__meta-pill">Key: {selectedProject.key}</span>
            <span className="workspace-team-projects-page__meta-pill">Team: {teamName}</span>
            <span className="workspace-team-projects-page__meta-pill">Workspace: {workspaceName}</span>
          </div>
        </div>

        <div className="workspace-team-projects-page__actions-row">
          <div className="workspace-team-projects-page__actions-left">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={savingProjectId === selectedProject.id}
              disabled={savingProjectId === selectedProject.id || deletingProjectId === selectedProject.id}
            >
              <Save size={13} />
              <span>Save Project</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResetDraft}
              disabled={savingProjectId === selectedProject.id || deletingProjectId === selectedProject.id}
            >
              Reset
            </Button>
          </div>

          {isDeleteEnabled && onDeleteProject && (
            <div className="workspace-team-projects-page__actions-right" style={{ marginLeft: 'auto' }}>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={deletingProjectId === selectedProject.id}
                disabled={savingProjectId === selectedProject.id || deletingProjectId === selectedProject.id}
                onClick={onDeleteProject}
              >
                <Trash size={13} />
                <span>Delete</span>
              </Button>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

