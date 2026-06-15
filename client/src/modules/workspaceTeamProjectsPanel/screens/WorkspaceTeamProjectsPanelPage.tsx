import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ProjectCreateOverlay } from '../../../components/WorkspaceProjectPanel';
import { Button, TextInput, Textarea } from '@library';
import { FolderKanban, Save, Trash } from 'lucide-react';
import { addProjectToTeam, removeProjectFromTeam, updateProjectInTeam } from '../../../utils/sidebarTreeMutations';
import { sanitizeProjectKey, validateGithubRepoUrl } from '../../../utils/project';
import { queryKeys } from '../../../utils/queryClient';
import '../../workspacePage/styles/WorkspacePage.css';
import '../styles/WorkspaceTeamProjectsPage.css';
import { WorkspaceManagementLayout } from '../../../layouts/WorkspaceManagementLayout/WorkspaceManagementLayout';
import { WorkspaceTeamProjectsDeleteModal } from '../components/WorkspaceTeamProjectsDeleteModal';
import {
  WorkspaceManagementFeedback,
  WorkspaceManagementEditorSection,
  WorkspaceManagementListSection,
  WorkspaceManagementHeaderActions,
  WorkspaceManagementHero,
  WorkspaceManagementLoadingSkeleton,
} from '../../../components/WorkspaceManagementPage';
import { PROJECT_LIFECYCLE_OPTIONS, PROJECT_STATUS_LABELS } from '../../workspaceProjectsPanel/utils/WorkspaceProjectPanel';
import {
  createWorkspaceTeamProjectsPanelFeedback,
} from '../utils/WorkspaceTeamProjectsPanelUtils';
import { useWorkspaceTeamProjectsPanelDraft } from '../hooks/useWorkspaceTeamProjectsPanelDraft';
import { useWorkspaceTeamProjectsPanelSelection } from '../hooks/useWorkspaceTeamProjectsPanelSelection';
import { useWorkspaceTeamProjectsPanelTeamState } from '../hooks/useWorkspaceTeamProjectsPanelTeamState';
import { type WorkspaceTeamProjectsPanelFeedback, type WorkspaceTeamProjectsPanelProps } from '../types/WorkspaceTeamProjectsPanel';
import type { Project } from '../../../types/domain';

export function WorkspaceTeamProjectsPanelPage({
  workspaceId,
  workspaceName,
  projects,
  activeProjectId,
  teamId,
  sidebarTree,
  onBackToTeams,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}: WorkspaceTeamProjectsPanelProps) {
  const queryClient = useQueryClient();

  const { team, sortedProjects, loading } = useWorkspaceTeamProjectsPanelTeamState({
    projects,
    activeProjectId,
    teamId,
    sidebarTree,
  });

  const { selectedProjectId, setSelectedProjectId, selectedProject } = useWorkspaceTeamProjectsPanelSelection({
    projects: sortedProjects,
    activeProjectId,
  });

  const { projectDraft, setProjectDraft, resetProjectDraft } = useWorkspaceTeamProjectsPanelDraft({ selectedProject });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectCreateLoading, setProjectCreateLoading] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [savingProjectId, setSavingProjectId] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [feedback, setFeedback] = useState<WorkspaceTeamProjectsPanelFeedback | null>(null);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    setFeedback(null);
  }, [selectedProject]);

  const handleCreateProject = async (project: { name: string; description: string; key: string }) => {
    if (!team) {
      setProjectCreateError('Unable to create this project yet. Please refresh and retry.');
      return;
    }

    setProjectCreateLoading(true);
    setProjectCreateError(null);

    try {
      const createdProject = await onCreateProject({
        workspaceId,
        teamId: team.id,
        name: project.name.trim(),
        description: project.description.trim(),
        key: sanitizeProjectKey(project.key),
        status: 'active',
      });

      if (createdProject?.id) {
        addProjectToTeam(queryClient, workspaceId, team.id, {
          ...createdProject,
          workspaceId: workspaceId || createdProject.workspaceId,
          teamId: team.id,
        });
        setSelectedProjectId(createdProject.id);
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });

      setIsCreateModalOpen(false);
      setFeedback(createWorkspaceTeamProjectsPanelFeedback('success', 'Project created.'));
    } catch (error) {
      setProjectCreateError(error instanceof Error ? error.message : 'Failed to create project.');
    } finally {
      setProjectCreateLoading(false);
    }
  };

  const handleSaveProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProject || !team) {
      return;
    }

    const { url: githubRepoUrl, error } = validateGithubRepoUrl(projectDraft.githubRepoUrl);
    if (error) {
      setFeedback(createWorkspaceTeamProjectsPanelFeedback('error', error));
      return;
    }

    setSavingProjectId(selectedProject.id);
    setFeedback(null);

    // Optimistically update the sidebar tree while the request is in-flight.
    updateProjectInTeam(queryClient, workspaceId, team.id, selectedProject.id, (project) => ({
      ...project,
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim(),
      githubRepoUrl: githubRepoUrl || null,
      status: projectDraft.status,
    }));

    onUpdateProject(selectedProject.id, {
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim(),
      githubRepoUrl: githubRepoUrl || null,
      status: projectDraft.status,
    })
      .then((updatedProject) => {
        if (updatedProject) {
          setSelectedProjectId(updatedProject.id);
        }
        setFeedback(createWorkspaceTeamProjectsPanelFeedback('success', 'Project updated.'));
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });
      })
      .catch((error) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });
        setFeedback(
          createWorkspaceTeamProjectsPanelFeedback(
            'error',
            error instanceof Error ? error.message : 'Failed to update project.',
          ),
        );
      })
      .finally(() => {
        setSavingProjectId('');
      });
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setFeedback(null);
  };

  const handleDeleteProject = () => {
    if (!selectedProject || !onDeleteProject) {
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedProject || !onDeleteProject || !team) {
      return;
    }

    const projectId = selectedProject.id;
    setIsDeleteModalOpen(false);
    setDeletingProjectId(projectId);
    setFeedback(null);

    // Optimistically update sidebar tree
    removeProjectFromTeam(queryClient, workspaceId, team.id, projectId);

    setFeedback(createWorkspaceTeamProjectsPanelFeedback('success', 'Project deleted successfully.'));

    const remainingProjects = sortedProjects.filter((value) => value.id !== projectId);
    if (remainingProjects.length > 0) {
      setSelectedProjectId(remainingProjects[0].id);
    } else {
      setSelectedProjectId('');
    }

    // Fire and forget
    onDeleteProject(projectId)
      .catch((error) => {
        setFeedback(
          createWorkspaceTeamProjectsPanelFeedback(
            'error',
            error instanceof Error ? error.message : 'Failed to delete project.',
          ),
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });
      })
      .finally(() => {
        setDeletingProjectId('');
      });
  };

  const handleResetDraft = () => {
    resetProjectDraft();
    setFeedback(null);
  };

  return (
    <WorkspaceManagementLayout
      title="Manage Team Projects"
      pageClassName="workspace-team-projects-page"
      contentClassName="workspace-team-projects-page__content"
      actions={
        <WorkspaceManagementHeaderActions
          classNamePrefix="workspace-team-projects-page"
          onBack={onBackToTeams}
          backLabel="Back to Teams"
          onCreate={() => setIsCreateModalOpen(true)}
          createLabel="New Project"
          canCreate={!!team}
        />
      }
      hero={
        <WorkspaceManagementHero
          classNamePrefix="workspace-team-projects-page"
          eyebrow="Team projects"
          title={team?.name ?? 'Loading team...'}
          metaItems={[`${sortedProjects.length} projects`, workspaceName]}
          description={team?.description || 'Create and refine the projects owned by this team without leaving team management.'}
          StatIcon={FolderKanban}
          statValue={sortedProjects.length}
          statSingularLabel="project"
          statPluralLabel="projects"
        />
      }
      feedback={<WorkspaceManagementFeedback classNamePrefix="workspace-team-projects-page" feedback={feedback} />}
      loading={loading}
      loadingNode={
        <WorkspaceManagementLoadingSkeleton
          layoutClassName="workspace-team-projects-page__layout"
          cardClassName="workspace-team-projects-page__projects-card"
          listClassName="workspace-team-projects-page__project-list"
          itemClassName="workspace-team-projects-page__project-card"
          itemLineWidths={['30%', '60%', '80%']}
          editorCardClassName="workspace-team-projects-page__editor-card"
        />
      }
    >
      <div className="workspace-team-projects-page__layout">
        <WorkspaceManagementListSection<Project>
          classNamePrefix="workspace-team-projects-page"
          sectionClassName="workspace-team-projects-page__projects-card"
          listClassName="workspace-team-projects-page__project-list"
          ariaLabel="Team projects"
          sectionKicker="Project roster"
          sectionTitle={`${team?.name ?? 'Team'} projects`}
          sectionDescription="Pick a project to edit, or create a new one for this team."
          items={sortedProjects}
          selectedItemId={selectedProject?.id ?? ''}
          onSelectItem={handleSelectProject}
          emptyStateTitle="No projects in this team yet"
          emptyStateDescription={`Use New Project to create the first project for ${team?.name ?? 'this team'}.`}
          renderItem={({ item: project, isSelected, onSelect }) => (
            <button
              type="button"
              className={
                isSelected
                  ? 'workspace-team-projects-page__project-card workspace-team-projects-page__project-card--active'
                  : 'workspace-team-projects-page__project-card'
              }
              onClick={onSelect}
            >
              <div className="workspace-team-projects-page__project-card-top">
                <span className="workspace-team-projects-page__project-key">{project.key}</span>
                <span
                  className={`workspace-team-projects-page__project-status workspace-team-projects-page__project-status--${project.status}`}
                >
                  {PROJECT_STATUS_LABELS[project.status]}
                </span>
              </div>

              <div className="workspace-team-projects-page__project-card-body">
                <div className="workspace-team-projects-page__project-name">{project.name}</div>
                <p>{project.description || 'No description added yet.'}</p>
              </div>

              <div className="workspace-team-projects-page__project-card-footer">
                <span>{project.githubRepoUrl ? 'GitHub linked' : 'No GitHub repo'}</span>
                <span>{isSelected ? 'Selected' : 'Click to edit'}</span>
              </div>
            </button>
          )}
        />

        <WorkspaceManagementEditorSection<Project>
          classNamePrefix="workspace-team-projects-page"
          editorClassName="workspace-team-projects-page__editor-card"
          ariaLabel="Project editor"
          sectionKicker="Project editor"
          emptyStateTitle="No project selected"
          emptyStateDescription={`Select a project or create the first one for ${team?.name ?? 'this team'}.`}
          sectionDescription="Update the project details that shape how this team ships work."
          selectedItem={selectedProject}
          getSelectedItemTitle={(project) => project.name}
        >
          {(selectedProjectForEditor) => (
            <form className="workspace-team-projects-page__form" aria-label="Project editor" onSubmit={handleSaveProject}>
              <div className="workspace-team-projects-page__form-fields">
                <div className="workspace-team-projects-page__field-grid">
                  <TextInput
                    label="Project Name"
                    value={projectDraft.name}
                    onChange={(event) => onDraftChange((draft) => ({ ...draft, name: event.target.value }))}
                    placeholder="Core Platform"
                    required
                  />

                  <TextInput
                    label="GitHub Repository URL"
                    value={projectDraft.githubRepoUrl}
                    onChange={(event) => onDraftChange((draft) => ({ ...draft, githubRepoUrl: event.target.value }))}
                    placeholder="https://github.com/owner/repo"
                  />
                </div>

                <Textarea
                  label="Description"
                  value={projectDraft.description}
                  onChange={(event) => onDraftChange((draft) => ({ ...draft, description: event.target.value }))}
                  placeholder="Describe what this project owns."
                  className="workspace-team-projects-page__description-field"
                  autoGrow={false}
                  inputStyle={{ resize: 'none' }}
                />

                <div className="workspace-team-projects-page__status-group" aria-label="Project status">
                  {PROJECT_LIFECYCLE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={projectDraft.status === option.value ? 'primary' : 'secondary'}
                      onClick={() => onDraftChange((draft) => ({ ...draft, status: option.value as Project['status'] }))}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>

                <div className="workspace-team-projects-page__meta">
                  <span className="workspace-team-projects-page__meta-pill">Key: {selectedProjectForEditor.key}</span>
                  <span className="workspace-team-projects-page__meta-pill">Team: {team?.name ?? 'Team'}</span>
                  <span className="workspace-team-projects-page__meta-pill">Workspace: {workspaceName}</span>
                </div>
              </div>

              <div className="workspace-team-projects-page__actions-row">
                <div className="workspace-team-projects-page__actions-left">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={savingProjectId === selectedProjectForEditor.id}
                    disabled={
                      savingProjectId === selectedProjectForEditor.id || deletingProjectId === selectedProjectForEditor.id
                    }
                  >
                    <Save size={13} />
                    <span>Save Project</span>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleResetDraft}
                    disabled={
                      savingProjectId === selectedProjectForEditor.id || deletingProjectId === selectedProjectForEditor.id
                    }
                  >
                    <span>Reset</span>
                  </Button>
                </div>

                {onDeleteProject ? (
                  <div className="workspace-team-projects-page__actions-right" style={{ marginLeft: 'auto' }}>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      loading={deletingProjectId === selectedProjectForEditor.id}
                      disabled={
                        savingProjectId === selectedProjectForEditor.id || deletingProjectId === selectedProjectForEditor.id
                      }
                      onClick={onDeleteProject ? handleDeleteProject : undefined}
                    >
                      <Trash size={13} />
                      <span>Delete</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </form>
          )}
        </WorkspaceManagementEditorSection>
      </div>

      {isCreateModalOpen && (
        <ProjectCreateOverlay
          loading={projectCreateLoading}
          errorMessage={projectCreateError}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmitProject={handleCreateProject}
        />
      )}

      {isDeleteModalOpen && selectedProject && (
        <WorkspaceTeamProjectsDeleteModal
          isOpen={isDeleteModalOpen}
          projectName={selectedProject.name}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </WorkspaceManagementLayout>
  );
}
