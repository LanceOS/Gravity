import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { WorkspaceProjectPanel } from '../../components/WorkspaceProjectPanel';
import type { Domain, Project } from '../../context/TicketContext';
import '../WorkspacePage/WorkspacePage.css';
import './WorkspaceProjectsPage.css';

interface WorkspaceProjectsPageProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  domains: Domain[];
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  projectManageLoading: boolean;
  projectManageError: string | null;
  defaultProjectLoading: boolean;
  domainCreateLoading: boolean;
  domainCreateError: string | null;
  onBackToWorkspace: () => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onCreateDomain: (domain: { name: string; color: string }) => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onSetDefaultProject: (projectId: string) => Promise<void>;
  onUpdateProjectInfo: (projectId: string, updates: { name: string; description: string; status: Project['status'] }) => Promise<void>;
}

export function WorkspaceProjectsPage({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  domains,
  projectCreateLoading,
  projectCreateError,
  projectManageLoading,
  projectManageError,
  defaultProjectLoading,
  domainCreateLoading,
  domainCreateError,
  onBackToWorkspace,
  onCreateProject,
  onCreateDomain,
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
          <Button
            type="button"
            className="workspace-page__projects-button"
            onClick={onBackToWorkspace}
          >
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </Button>
        </div>
      </header>

      <div className="workspace-projects-page__content">
        <WorkspaceProjectPanel
          workspaceName={workspaceName}
          projects={projects}
          activeProjectId={activeProjectId}
          defaultProjectId={defaultProjectId}
          domains={domains}
          projectCreateLoading={projectCreateLoading}
          projectCreateError={projectCreateError}
          projectManageLoading={projectManageLoading}
          projectManageError={projectManageError}
          defaultProjectLoading={defaultProjectLoading}
          domainCreateLoading={domainCreateLoading}
          domainCreateError={domainCreateError}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onCreateDomain={onCreateDomain}
          onUpdateProject={onUpdateProjectInfo}
          onSetDefaultProject={onSetDefaultProject}
        />
      </div>
    </div>
  );
}