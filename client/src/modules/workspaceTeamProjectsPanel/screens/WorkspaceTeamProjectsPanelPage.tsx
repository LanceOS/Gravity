import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ProjectCreateOverlay } from '../../workspaceProjectsPanel/components/ProjectCreateOverlay';
import { sanitizeProjectKey } from '../../workspaceProjectsPanel/utils/WorkspaceProjectPanel';
import type { Project, SidebarTeam } from '../../../types/domain';
import { WorkspaceHeader } from '../../workspaces/components/WorkspaceHeader';
import { removeProjectFromTeam, updateProjectInTeam } from '../../../utils/sidebarTreeMutations';
import { type WorkspaceTeamProjectsPanelDraft, type WorkspaceTeamProjectsPanelFeedback, type WorkspaceTeamProjectsPanelProps } from '../types/WorkspaceTeamProjectsPanel';
import '../../../pages/WorkspacePage/WorkspacePage.css';
import './WorkspaceTeamProjectsPage.css';
import { WorkspaceTeamProjectsDeleteModal } from '../components/WorkspaceTeamProjectsDeleteModal';
import { WorkspaceTeamProjectsEditorSection } from '../components/WorkspaceTeamProjectsEditorSection';
import { WorkspaceTeamProjectsFeedback } from '../components/WorkspaceTeamProjectsFeedback';
import { WorkspaceTeamProjectsHeaderActions } from '../components/WorkspaceTeamProjectsHeaderActions';
import { WorkspaceTeamProjectsHero } from '../components/WorkspaceTeamProjectsHero';
import { WorkspaceTeamProjectsLoadingSkeleton } from '../components/WorkspaceTeamProjectsLoadingSkeleton';
import { WorkspaceTeamProjectsProjectListSection } from '../components/WorkspaceTeamProjectsProjectListSection';

function getProjectDraft(project?: Project | null): WorkspaceTeamProjectsPanelDraft {
  return {
    name: project?.name ?? '',
    description: project?.description ?? '',
    githubRepoUrl: project?.githubRepoUrl ?? '',
    status: project?.status ?? 'active',
  };
}

function validateGithubRepoUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { url: null as string | null, error: null as string | null };
  }

  try {
    const parsed = new URL(trimmed);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || pathParts.length < 2) {
      return {
        url: null as string | null,
        error: 'URL must be a valid GitHub repository URL (e.g. https://github.com/owner/repo).',
      };
    }
    return { url: trimmed, error: null as string | null };
  } catch {
    return {
      url: null as string | null,
      error: 'Please enter a valid URL (e.g. https://github.com/owner/repo).',
    };
  }
}

function toFeedback(type: WorkspaceTeamProjectsPanelFeedback['type'], message: string): WorkspaceTeamProjectsPanelFeedback {
  return { type, message };
}

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
  const activeProjectTeamId = useMemo(() => {
    const activeProject = projects.find((project) => project.id === activeProjectId);
    return activeProject?.teamId ?? '';
  }, [activeProjectId, projects]);
  const sidebarActiveTeamId = teamId || activeProjectTeamId;
  const team = useMemo<SidebarTeam | null>(() => {
    return sidebarTree?.teams?.find((sidebarTeam) => sidebarTeam.id === sidebarActiveTeamId) ?? null;
  }, [sidebarTree?.teams, sidebarActiveTeamId]);
  const teamProjectIds = useMemo(() => new Set(team?.projects?.map((project) => project.id) ?? []), [team]);
  const managedProjects = useMemo(() => {
    if (!sidebarActiveTeamId) {
      return [];
    }
    return projects.filter((project) => project.teamId === sidebarActiveTeamId || teamProjectIds.has(project.id));
  }, [projects, sidebarActiveTeamId, teamProjectIds]);

  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectCreateLoading, setProjectCreateLoading] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectDraft, setProjectDraft] = useState<WorkspaceTeamProjectsPanelDraft>(getProjectDraft());
  const [savingProjectId, setSavingProjectId] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [feedback, setFeedback] = useState<WorkspaceTeamProjectsPanelFeedback | null>(null);
  const lastSyncedActiveProjectId = useRef(activeProjectId);
  const loading = !sidebarTree || !team;

  const sortedProjects = useMemo(
    () => [...managedProjects].sort((first, second) => first.name.localeCompare(second.name)),
    [managedProjects],
  );

  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.id === selectedProjectId) ?? null,
    [sortedProjects, selectedProjectId],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (sortedProjects.length === 0) {
      setSelectedProjectId('');
      lastSyncedActiveProjectId.current = activeProjectId;
      return;
    }

    const activeProjectExists = !!activeProjectId && sortedProjects.some((project) => project.id === activeProjectId);
    const selectedProjectExists = !!selectedProjectId && sortedProjects.some((project) => project.id === selectedProjectId);
    const activeProjectChanged = lastSyncedActiveProjectId.current !== activeProjectId;

    if (!selectedProjectExists && activeProjectExists) {
      setSelectedProjectId(activeProjectId);
      lastSyncedActiveProjectId.current = activeProjectId;
      return;
    }

    if (activeProjectChanged && activeProjectExists) {
      setSelectedProjectId(activeProjectId);
      lastSyncedActiveProjectId.current = activeProjectId;
      return;
    }

    if (!selectedProjectExists) {
      setSelectedProjectId(sortedProjects[0].id);
    }
    lastSyncedActiveProjectId.current = activeProjectId;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeProjectId, selectedProjectId, sortedProjects]);

  const prevSelectedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!selectedProject) {
      return;
    }

    if (prevSelectedProjectIdRef.current !== selectedProject.id) {
      setProjectDraft(getProjectDraft(selectedProject));
      setFeedback(null);
      prevSelectedProjectIdRef.current = selectedProject.id;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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
      setFeedback(toFeedback('success', 'Project created.'));
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
      setFeedback(toFeedback('error', error));
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
        setFeedback(toFeedback('success', 'Project updated.'));
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
      })
      .catch((error) => {
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
        setFeedback(
          toFeedback(
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

    setFeedback(toFeedback('success', 'Project deleted successfully.'));

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
          toFeedback(
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
    setProjectDraft(getProjectDraft(selectedProject));
    setFeedback(null);
  };

  return (
    <div className="workspace-page workspace-team-projects-page">
      <WorkspaceHeader>
        <WorkspaceHeader.Top>
          <WorkspaceHeader.Title>Manage Team Projects</WorkspaceHeader.Title>

          <WorkspaceTeamProjectsHeaderActions
            onBackToTeams={onBackToTeams}
            onOpenCreateProject={() => setIsCreateModalOpen(true)}
            canCreateProject={!!team}
          />
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className="workspace-team-projects-page__content">
        <WorkspaceTeamProjectsHero
          teamName={team?.name}
          teamDescription={team?.description}
          workspaceName={workspaceName}
          projectCount={sortedProjects.length}
        />

        <WorkspaceTeamProjectsFeedback feedback={feedback} />

        {loading ? (
          <WorkspaceTeamProjectsLoadingSkeleton />
        ) : (
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
        )}
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
    </div>
  );
}
