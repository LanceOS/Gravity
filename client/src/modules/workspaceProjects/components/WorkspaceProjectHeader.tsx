import { Plus } from 'lucide-react';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';

interface WorkspaceProjectHeaderProps {
  workspaceName: string;
  projectCount: number;
  projectCreateError: string | null;
}

export function WorkspaceProjectHeader({
  workspaceName,
  projectCount,
  projectCreateError,
}: WorkspaceProjectHeaderProps) {
  const { openCreateProjectModal } = useWorkspaceProjectPanelActionsContext();

  return (
    <>
      <div className="workspace-page__projects-header">
        <div className="workspace-page__projects-title-block">
          <div className="workspace-page__projects-eyebrow">Workspace Projects</div>
          <div className="workspace-page__projects-title-row">
            <h2 className="workspace-page__projects-title">{workspaceName}</h2>
            <span className="workspace-page__projects-count">{projectCount} total</span>
          </div>
          <p className="workspace-page__projects-subtitle">Create and switch projects in this workspace.</p>
        </div>

        <div className="workspace-page__projects-actions">
          <button
            type="button"
            className="workspace-page__projects-button workspace-page__projects-button--primary"
            onClick={openCreateProjectModal}
          >
            <Plus size={14} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {projectCreateError ? (
        <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{projectCreateError}</div>
      ) : null}
    </>
  );
}
