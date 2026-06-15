import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';

import { PROJECT_STATUS_LABELS } from '../utils/WorkspaceProjectPanel';

interface WorkspaceProjectCurrentProjectSectionProps {
  defaultProjectId: string | null;
  labelCount: number;
}

export function WorkspaceProjectCurrentProjectSection({
  defaultProjectId,
  labelCount,
}: WorkspaceProjectCurrentProjectSectionProps) {
  const { currentProject } = useWorkspaceProjectPanelProjectStateContext();

  return currentProject ? (
    <article className="workspace-page__current-project">
      <div className="workspace-page__current-project-main">
        <div className="workspace-page__projects-eyebrow">Current Project</div>
        <div className="workspace-page__current-project-heading">
          <div className="workspace-page__project-key">{currentProject.key}</div>
          <h3 className="workspace-page__current-project-title">{currentProject.name}</h3>
          <div className="workspace-page__current-project-badges">
            {currentProject.id === defaultProjectId ? <span className="workspace-page__project-badge">Default</span> : null}
            <span className={`workspace-page__project-status workspace-page__project-status--${currentProject.status}`}>
              {PROJECT_STATUS_LABELS[currentProject.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="workspace-page__current-project-summary">
        <div className="workspace-page__current-project-meta">
          <span className="workspace-page__current-project-meta-pill">
            {currentProject.id === defaultProjectId ? 'Default project' : 'Workspace project'}
          </span>
          <span className="workspace-page__current-project-meta-pill">
            {labelCount} {labelCount === 1 ? 'label' : 'labels'}
          </span>
        </div>
        <p className="workspace-page__current-project-copy">
          {currentProject.description || 'Add a short description for this project.'}
        </p>
      </div>
    </article>
  ) : (
    <div className="workspace-page__project-empty-shell">
      <div className="workspace-page__empty-state-title">No projects in this workspace yet</div>
      <p className="workspace-page__empty-state-copy">
        Create the first project to unlock ticket, label, and cycle management for this workspace.
      </p>
    </div>
  );
}
