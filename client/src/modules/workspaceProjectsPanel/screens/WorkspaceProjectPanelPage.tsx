import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { ProjectCreateOverlay, ProjectSelectionRail } from '../../../components/WorkspaceProjectPanel';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';
import { WorkspaceProjectPanelContextProviders } from '../context/WorkspaceProjectPanelContextProviders';
import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';
import { WorkspaceProjectCurrentProjectSection } from '../components/WorkspaceProjectCurrentProjectSection';
import { WorkspaceProjectHeader } from '../components/WorkspaceProjectHeader';
import { WorkspaceProjectLabelCreateForm } from '../components/WorkspaceProjectLabelCreateForm';
import { WorkspaceProjectLabelEditor } from '../components/WorkspaceProjectLabelEditor';
import { WorkspaceProjectLabelList } from '../components/WorkspaceProjectLabelList';
import { WorkspaceProjectLabelNoSelectionMessage } from '../components/WorkspaceProjectLabelNoSelectionMessage';
import { WorkspaceProjectLabelSectionErrors } from '../components/WorkspaceProjectLabelSectionErrors';
import { WorkspaceProjectLabelSectionHeader } from '../components/WorkspaceProjectLabelSectionHeader';

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
  confirmDeleteLabel,
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
      confirmDeleteLabel={confirmDeleteLabel}
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
    currentProject,
  } = useWorkspaceProjectPanelProjectStateContext();
  const { sortedLabels, activeLabel, editingLabelLoading } = useWorkspaceProjectPanelLabelStateContext();
  const { isCreateProjectModalOpen, closeCreateProjectModal, createProject, selectProject } =
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
        <ProjectSelectionRail
          projects={projectStrip}
          selectedProjectId={managedProject?.id || currentProject?.id || null}
          defaultProjectId={defaultProjectId}
          onSelectProject={selectProject}
        />
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
