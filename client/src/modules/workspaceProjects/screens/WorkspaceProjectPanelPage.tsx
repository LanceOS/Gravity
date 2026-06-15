import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { ProjectCreateOverlay } from '../components/ProjectCreateOverlay';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';
import { WorkspaceProjectPanelContextProviders } from '../context/WorkspaceProjectPanelContextProviders';
import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';
import { ProjectSelectionRail } from '../components/ProjectSelectionRail';
import { WorkspaceProjectCurrentProjectSection } from '../components/WorkspaceProjectCurrentProjectSection';
import { WorkspaceProjectHeader } from '../components/WorkspaceProjectHeader';
import { WorkspaceProjectLabelCreateForm } from '../components/WorkspaceProjectLabelCreateForm';
import { WorkspaceProjectLabelEditor } from '../components/WorkspaceProjectLabelEditor';
import { WorkspaceProjectLabelList } from '../components/WorkspaceProjectLabelList';
import { WorkspaceProjectLabelNoSelectionMessage } from '../components/WorkspaceProjectLabelNoSelectionMessage';
import { WorkspaceProjectLabelSectionErrors } from '../components/WorkspaceProjectLabelSectionErrors';
import { WorkspaceProjectLabelSectionHeader } from '../components/WorkspaceProjectLabelSectionHeader';
import { WorkspaceProjectSettingsSection } from '../components/WorkspaceProjectSettingsSection';

export function WorkspaceProjectPanelPage({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  labels,
  projectCreateLoading,
  projectCreateError,
  labelCreateLoading,
  labelCreateError,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: WorkspaceProjectPanelProps) {
  return (
    <WorkspaceProjectPanelContextProviders
      projects={projects}
      activeProjectId={activeProjectId}
      labels={labels}
      onSelectProject={onSelectProject}
      onCreateProject={onCreateProject}
      onUpdateProject={onUpdateProject}
      onCreateLabel={onCreateLabel}
      onUpdateLabel={onUpdateLabel}
      onDeleteLabel={onDeleteLabel}
    >
      <WorkspaceProjectPanelPageContent
        workspaceName={workspaceName}
        hasProjects={projects.length > 0}
        projectCreateLoading={projectCreateLoading}
        projectCreateError={projectCreateError}
        defaultProjectId={defaultProjectId}
        labelCreateLoading={labelCreateLoading}
        labelCreateError={labelCreateError}
      />
    </WorkspaceProjectPanelContextProviders>
  );
}

interface WorkspaceProjectPanelPageContentProps {
  hasProjects: boolean;
  workspaceName: string;
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  defaultProjectId: string | null;
  labelCreateLoading: boolean;
  labelCreateError: string | null;
}

function WorkspaceProjectPanelPageContent({
  hasProjects,
  workspaceName,
  projectCreateLoading,
  projectCreateError,
  defaultProjectId,
  labelCreateLoading,
  labelCreateError,
}: WorkspaceProjectPanelPageContentProps) {
  const {
    managedProject,
    projectStrip,
  } = useWorkspaceProjectPanelProjectStateContext();
  const { sortedLabels, activeLabel, editingLabelLoading } = useWorkspaceProjectPanelLabelStateContext();
  const { isCreateProjectModalOpen, closeCreateProjectModal, createProject } =
    useWorkspaceProjectPanelActionsContext();

  const isLabelBusy = labelCreateLoading || editingLabelLoading;

  return (
    <section className="workspace-page__projects-panel">
      <WorkspaceProjectHeader
        workspaceName={workspaceName}
        projectCount={projectStrip.length}
        projectCreateError={projectCreateError}
      />

      <WorkspaceProjectCurrentProjectSection
        defaultProjectId={defaultProjectId}
        labelCount={sortedLabels.length}
      />

      {managedProject ? (
        <section className="workspace-page__project-domains">
          <WorkspaceProjectLabelSectionHeader />
          <WorkspaceProjectLabelSectionErrors labelCreateError={labelCreateError} />
          <WorkspaceProjectLabelList />
          {activeLabel ? (
            <WorkspaceProjectLabelEditor
              isLabelBusy={isLabelBusy}
              editingLabelLoading={editingLabelLoading}
            />
          ) : (
            <WorkspaceProjectLabelNoSelectionMessage />
          )}
          <WorkspaceProjectLabelCreateForm
            isLabelBusy={isLabelBusy}
            labelCreateLoading={labelCreateLoading}
          />
        </section>
      ) : null}

      {managedProject ? (
        <WorkspaceProjectSettingsSection />
      ) : null}

      {hasProjects ? (
        <ProjectSelectionRail defaultProjectId={defaultProjectId} />
      ) : null}

      {isCreateProjectModalOpen ? (
        <ProjectCreateOverlay
          loading={projectCreateLoading}
          errorMessage={projectCreateError}
          onClose={closeCreateProjectModal}
          onSubmitProject={createProject}
        />
      ) : null}
    </section>
  );
}
