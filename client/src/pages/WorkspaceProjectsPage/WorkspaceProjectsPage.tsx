import { ArrowLeft } from 'lucide-react';
import { Button } from '@library';
import { WorkspaceProjectPanel } from '../../components/WorkspaceProjectPanel';
import { WorkspaceHeader } from '../../components/WorkspaceHeader';
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
  domainCreateLoading: boolean;
  domainCreateError: string | null;
  onBackToWorkspace: () => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onCreateDomain: (domain: { projectId: string; name: string; color: string }) => Promise<void>;
  onSelectProject: (projectId: string) => void;
}

export function WorkspaceProjectsPage({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  domains,
  projectCreateLoading,
  projectCreateError,
  domainCreateLoading,
  domainCreateError,
  onBackToWorkspace,
  onCreateProject,
  onCreateDomain,
  onSelectProject,
}: WorkspaceProjectsPageProps) {
  return (
    <div className="workspace-page workspace-projects-page">
      <WorkspaceHeader>
        <WorkspaceHeader.Top>
          <WorkspaceHeader.Title>Manage Projects</WorkspaceHeader.Title>

          <div className="workspace-projects-page__actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBackToWorkspace}
            >
              <ArrowLeft size={14} />
              <span>Back to Workspace</span>
            </Button>
          </div>
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className="workspace-projects-page__content">
        <WorkspaceProjectPanel
          workspaceName={workspaceName}
          projects={projects}
          activeProjectId={activeProjectId}
          defaultProjectId={defaultProjectId}
          domains={domains}
          projectCreateLoading={projectCreateLoading}
          projectCreateError={projectCreateError}
          domainCreateLoading={domainCreateLoading}
          domainCreateError={domainCreateError}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onCreateDomain={onCreateDomain}
        />
      </div>
    </div>
  );
}