import { ArrowLeft } from 'lucide-react';
import { Button } from '@library';
import { WorkspaceProjectPanel, WorkspaceHeader } from '../../modules/workspaces';
import type { Label, Project } from '../../context/TicketContext';
import '../WorkspacePage/WorkspacePage.css';
import './WorkspaceProjectsPage.css';

interface WorkspaceProjectsPageProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  labels: Label[];
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  labelCreateLoading: boolean;
  labelCreateError: string | null;
  onBackToWorkspace: () => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onCreateLabel: (label: { projectId: string; name: string; color: string; description?: string; sortOrder?: number }) => Promise<void>;
  onUpdateLabel: (labelId: string, updates: { name?: string; color?: string; description?: string; sortOrder?: number }) => Promise<void>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  onSelectProject: (projectId: string) => void;
}

export function WorkspaceProjectsPage({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  labels,
  projectCreateLoading,
  projectCreateError,
  labelCreateLoading,
  labelCreateError,
  onBackToWorkspace,
  onCreateProject,
  onUpdateProject,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
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
          labels={labels}
          projectCreateLoading={projectCreateLoading}
          projectCreateError={projectCreateError}
          labelCreateLoading={labelCreateLoading}
          labelCreateError={labelCreateError}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onUpdateProject={onUpdateProject}
          onCreateLabel={onCreateLabel}
          onUpdateLabel={onUpdateLabel}
          onDeleteLabel={onDeleteLabel}
        />
      </div>
    </div>
  );
}
