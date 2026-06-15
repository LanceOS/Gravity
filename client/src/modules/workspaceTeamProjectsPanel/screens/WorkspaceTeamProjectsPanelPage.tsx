import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ProjectCreateOverlay } from '../../../components/WorkspaceProjectPanel';
import { removeProjectFromTeam, updateProjectInTeam } from '../../../utils/sidebarTreeMutations';
import { sanitizeProjectKey, validateGithubRepoUrl } from '../../../utils/project';
import '../../workspacePage/styles/WorkspacePage.css';
import '../styles/WorkspaceTeamProjectsPage.css';
import { WorkspaceManagementLayout } from '../../../layouts/WorkspaceManagementLayout/WorkspaceManagementLayout';
import { WorkspaceTeamProjectsDeleteModal } from '../components/WorkspaceTeamProjectsDeleteModal';
import { WorkspaceTeamProjectsEditorSection } from '../components/WorkspaceTeamProjectsEditorSection';
import { WorkspaceTeamProjectsProjectListSection } from '../components/WorkspaceTeamProjectsProjectListSection';
import {
  WorkspaceManagementFeedback,
  WorkspaceManagementHeaderActions,
  WorkspaceManagementHero,
  WorkspaceManagementLoadingSkeleton,
} from '../../../components/WorkspaceManagementPage';
import { FolderKanban } from 'lucide-react';
import {
  createWorkspaceTeamProjectsPanelFeedback,
} from '../utils/WorkspaceTeamProjectsPanelUtils';
import { useWorkspaceTeamProjectsPanelDraft } from '../hooks/useWorkspaceTeamProjectsPanelDraft';
import { useWorkspaceTeamProjectsPanelSelection } from '../hooks/useWorkspaceTeamProjectsPanelSelection';
import { useWorkspaceTeamProjectsPanelTeamState } from '../hooks/useWorkspaceTeamProjectsPanelTeamState';
import { type WorkspaceTeamProjectsPanelFeedback, type WorkspaceTeamProjectsPanelProps } from '../types/WorkspaceTeamProjectsPanel';

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
      return;
    }

    setProjectCreateLoading(true);
    setProjectCreateError(null);

    try {
      await onCreateProject({
        workspaceId,
        teamId: team.id,
        name: project.name.trim(),
        description: project.description.trim(),
        key: sanitizeProjectKey(project.key),
        status: 'active',
      });
      void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });

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
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
      })
      .catch((error) => {
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
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
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
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
        <WorkspaceTeamProjectsProjectListSection
          projects={sortedProjects}
          selectedProjectId={selectedProject?.id ?? ''}
          teamName={team?.name}
          onSelectProject={handleSelectProject}
        />

        <WorkspaceTeamProjectsEditorSection
          selectedProject={selectedProject}
          projectDraft={projectDraft}
          teamName={team?.name ?? 'Team'}
          workspaceName={workspaceName}
          savingProjectId={savingProjectId}
          deletingProjectId={deletingProjectId}
          isDeleteEnabled={!!onDeleteProject}
          onDraftChange={setProjectDraft}
          onResetDraft={handleResetDraft}
          onSubmit={handleSaveProject}
          onDeleteProject={onDeleteProject ? handleDeleteProject : undefined}
        />
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
