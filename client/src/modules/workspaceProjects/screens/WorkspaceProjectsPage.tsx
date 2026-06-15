import { ArrowLeft } from 'lucide-react';
import { Button } from '@library';
import { WorkspaceHeader, WorkspaceProjectPanel } from '../../workspaces';
import type { WorkspaceProjectsPageProps } from '../types/WorkspaceProjectPanel';
import '../../pages/WorkspacePage/WorkspacePage.css';
import '../styles/WorkspaceProjectsPage.css';

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
            <Button type="button" variant="ghost" size="sm" onClick={onBackToWorkspace}>
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
