import { Button } from '@library';
import { FolderKanban, Sparkles } from 'lucide-react';
import type { Project } from '../../../context/TicketContextContext';
import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { ProjectCreateOverlay } from '../../../components/WorkspaceProjectPanel';
import { WorkspacePageLayout } from '../../../layouts/WorkspacePageLayout/WorkspacePageLayout';
import {
  WorkspaceManagementEditorSection,
  WorkspaceManagementFeedback,
} from '../../../components/WorkspaceManagementPage';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';
import { WorkspaceProjectPanelContextProviders } from '../context/WorkspaceProjectPanelContextProviders';
import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';
import { WorkspaceProjectLabelCreateForm } from '../components/WorkspaceProjectLabelCreateForm';
import { WorkspaceProjectLabelEditor } from '../components/WorkspaceProjectLabelEditor';
import { WorkspaceProjectLabelList } from '../components/WorkspaceProjectLabelList';
import { WorkspaceProjectLabelNoSelectionMessage } from '../components/WorkspaceProjectLabelNoSelectionMessage';
import { WorkspaceProjectLabelSectionErrors } from '../components/WorkspaceProjectLabelSectionErrors';
import { WorkspaceProjectLabelSectionHeader } from '../components/WorkspaceProjectLabelSectionHeader';
import { WorkspaceProjectSettingsSection } from '../components/WorkspaceProjectSettingsSection';
import { PROJECT_STATUS_LABELS } from '../utils/WorkspaceProjectPanel';

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
  onDeleteProject,
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
      onDeleteProject={onDeleteProject}
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
  const { isCreateProjectModalOpen, openCreateProjectModal, closeCreateProjectModal, createProject, selectProject } =
    useWorkspaceProjectPanelActionsContext();

  const isLabelBusy = labelCreateLoading || editingLabelLoading;
  const selectedProjectId = managedProject?.id || currentProject?.id || '';
  const projectFeedback = projectCreateError
    ? { type: 'error' as const, message: projectCreateError }
    : null;

  return (
    <>
      <WorkspacePageLayout.ContentHeader>
        <section className="workspace-projects-page__hero">
          <div>
            <div className="workspace-projects-page__eyebrow">Workspace projects</div>
            <div className="workspace-projects-page__hero-header">
              <h2>{workspaceName}</h2>
              <div className="workspace-projects-page__hero-meta">
                <span className="workspace-projects-page__hero-pill">{projectStrip.length} projects</span>
                {managedProject ? (
                  <span className="workspace-projects-page__hero-pill">Managing {managedProject.key}</span>
                ) : null}
              </div>
            </div>
            <p className="workspace-projects-page__hero-description">
              Create workspace projects, manage their labels, and connect repository settings from one place.
            </p>
          </div>

          <div className="workspace-projects-page__hero-side">
            <div className="workspace-projects-page__hero-stat">
              <FolderKanban size={18} />
              <span>{projectStrip.length}</span>
              <small>{projectStrip.length === 1 ? 'project' : 'projects'}</small>
            </div>

            <Button type="button" variant="primary" size="sm" onClick={openCreateProjectModal}>
              <Sparkles size={14} />
              <span>New Project</span>
            </Button>
          </div>
        </section>

        <WorkspaceManagementFeedback classNamePrefix="workspace-projects-page" feedback={projectFeedback} />
      </WorkspacePageLayout.ContentHeader>

      <WorkspacePageLayout.ContentBody>
        <div className="workspace-projects-page__layout">
          <section className="workspace-projects-page__projects-card" aria-label="Workspace projects">
            <div className="workspace-projects-page__section-header">
              <div>
                <div className="workspace-projects-page__section-kicker">Project roster</div>
                <h3>Workspace projects</h3>
              </div>
              <p>Select a project to edit its labels and repository settings.</p>
            </div>

            {!hasProjects ? (
              <div className="workspace-projects-page__empty">
                <div className="workspace-projects-page__empty-title">No projects in this workspace yet</div>
                <p>Create the first project to unlock ticket, label, and cycle management.</p>
              </div>
            ) : (
              <div className="workspace-projects-page__project-list">
                {projectStrip.map((project) => {
                  const isSelected = selectedProjectId === project.id;

                  return (
                    <button
                      key={project.id}
                      type="button"
                      className={
                        isSelected
                          ? 'workspace-projects-page__project-card workspace-projects-page__project-card--active'
                          : 'workspace-projects-page__project-card'
                      }
                      onClick={() => selectProject(project.id)}
                    >
                      <div className="workspace-projects-page__project-card-top">
                        <span className="workspace-projects-page__project-key">{project.key}</span>
                        <span
                          className={`workspace-projects-page__project-status workspace-projects-page__project-status--${project.status}`}
                        >
                          {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                      </div>

                      <div className="workspace-projects-page__project-card-body">
                        <div className="workspace-projects-page__project-name">{project.name}</div>
                        <p>{project.description || 'No description added yet.'}</p>
                      </div>

                      <div className="workspace-projects-page__project-card-footer">
                        <span>{project.id === defaultProjectId ? 'Default project' : 'Workspace project'}</span>
                        <span>{isSelected ? 'Selected' : 'Click to edit'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <WorkspaceManagementEditorSection<Project>
            classNamePrefix="workspace-projects-page"
            editorClassName="workspace-projects-page__editor-card"
            ariaLabel="Project editor"
            sectionKicker="Project editor"
            emptyStateTitle="No project selected"
            emptyStateDescription="Create or select a project to manage labels and repository settings."
            sectionDescription="Update the labels and integrations that keep this project organized."
            selectedItem={managedProject}
            getSelectedItemTitle={(project) => project.name}
          >
            {(selectedProject) => (
              <div className="workspace-projects-page__editor-stack">
                <div className="workspace-projects-page__meta">
                  <span className="workspace-projects-page__meta-pill">Key: {selectedProject.key}</span>
                  <span className="workspace-projects-page__meta-pill">
                    Status: {PROJECT_STATUS_LABELS[selectedProject.status]}
                  </span>
                  {selectedProject.id === defaultProjectId ? (
                    <span className="workspace-projects-page__meta-pill">Default project</span>
                  ) : null}
                  <span className="workspace-projects-page__meta-pill">
                    {sortedLabels.length} {sortedLabels.length === 1 ? 'label' : 'labels'}
                  </span>
                </div>

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

                <WorkspaceProjectSettingsSection />
              </div>
            )}
          </WorkspaceManagementEditorSection>
        </div>

        {isCreateProjectModalOpen ? (
          <ProjectCreateOverlay
            loading={projectCreateLoading}
            errorMessage={projectCreateError}
            onClose={closeCreateProjectModal}
            onSubmitProject={createProject}
          />
        ) : null}
      </WorkspacePageLayout.ContentBody>
    </>
  );
}
