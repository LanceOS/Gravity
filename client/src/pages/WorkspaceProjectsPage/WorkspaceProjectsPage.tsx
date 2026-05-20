import { ArrowLeft } from 'lucide-react';
import { WorkspaceProjectPanel } from '../../components/WorkspaceProjectPanel';
import type { Project } from '../../context/TicketContext';
import '../WorkspacePage/WorkspacePage.css';
import './WorkspaceProjectsPage.css';

interface WorkspaceProjectsPageProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  projectManageLoading: boolean;
  projectManageError: string | null;
  defaultProjectLoading: boolean;
  onBackToWorkspace: () => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onSetDefaultProject: (projectId: string) => Promise<void>;
  onUpdateProjectInfo: (projectId: string, updates: { name: string; description: string; status: Project['status'] }) => Promise<void>;
}

export function WorkspaceProjectsPage({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  projectCreateLoading,
  projectCreateError,
  projectManageLoading,
  projectManageError,
  defaultProjectLoading,
  onBackToWorkspace,
  onCreateProject,
  onSelectProject,
  onSetDefaultProject,
  onUpdateProjectInfo,
}: WorkspaceProjectsPageProps) {
  return (
    <div className="workspace-page workspace-projects-page">
      <header className="workspace-page__header">
        <div className="workspace-page__title-group">
          <span className="workspace-page__title">Manage Projects</span>
        </div>

        <div className="workspace-projects-page__actions">
          <button
            type="button"
            className="workspace-page__projects-button"
            onClick={onBackToWorkspace}
          >
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </button>
        </div>
      </header>

      <div className="workspace-projects-page__content">
        <div className="workspace-projects-page__panel-shell">
          <WorkspaceProjectPanel
            workspaceName={workspaceName}
            projects={projects}
            activeProjectId={activeProjectId}
            defaultProjectId={defaultProjectId}
            projectCreateLoading={projectCreateLoading}
            projectCreateError={projectCreateError}
            projectManageLoading={projectManageLoading}
            projectManageError={projectManageError}
            defaultProjectLoading={defaultProjectLoading}
            onSelectProject={onSelectProject}
            onCreateProject={onCreateProject}
            onUpdateProject={onUpdateProjectInfo}
            onSetDefaultProject={onSetDefaultProject}
          />
        </div>
      </div>
    </div>
  );
}