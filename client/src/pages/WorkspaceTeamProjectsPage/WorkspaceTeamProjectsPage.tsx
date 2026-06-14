import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderKanban, Save, Sparkles, Trash } from 'lucide-react';
import { Button, TextInput, Textarea, Modal, Skeleton } from '@library';
import { WorkspaceHeader } from '../../modules/workspaces';
import { ProjectCreateOverlay } from '../../modules/workspaces/components/ProjectCreateOverlay';
import { PROJECT_LIFECYCLE_OPTIONS, PROJECT_STATUS_LABELS, sanitizeProjectKey } from '../../modules/workspaces/utils/WorkspaceProjectPanel';
import type { CreateProjectInput, Project, SidebarTeam, SidebarTree } from '../../types/domain';
import '../WorkspacePage/WorkspacePage.css';
import './WorkspaceTeamProjectsPage.css';

type ProjectDraft = {
  name: string;
  description: string;
  githubRepoUrl: string;
  status: Project['status'];
};

interface WorkspaceTeamProjectsPageProps {
  workspaceId: string;
  workspaceName: string;
  team: SidebarTeam | null;
  projects: Project[];
  activeProjectId: string;
  loading?: boolean;
  onBackToTeams: () => void;
  onCreateProject: (project: CreateProjectInput) => Promise<Project | null>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onDeleteProject?: (id: string) => Promise<void>;
}

function getProjectDraft(project?: Project | null): ProjectDraft {
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

export function WorkspaceTeamProjectsPage({
  workspaceId,
  workspaceName,
  team,
  projects,
  activeProjectId,
  loading = false,
  onBackToTeams,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}: WorkspaceTeamProjectsPageProps) {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectCreateLoading, setProjectCreateLoading] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(getProjectDraft());
  const [savingProjectId, setSavingProjectId] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const lastSyncedActiveProjectId = useRef(activeProjectId);

  const sortedProjects = useMemo(
    () => [...projects].sort((first, second) => first.name.localeCompare(second.name)),
    [projects],
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
      const createdProject = await onCreateProject({
        workspaceId,
        teamId: team.id,
        name: project.name.trim(),
        description: project.description.trim(),
        key: sanitizeProjectKey(project.key),
        status: 'active',
      });

      if (createdProject) {
        queryClient.setQueryData<SidebarTree | undefined>(['sidebarTree', workspaceId], (current) => {
          if (!current) return current;
          return {
            ...current,
            teams: current.teams.map((t) => {
              if (t.id === team?.id) {
                return {
                  ...t,
                  projects: [...(t.projects || []), createdProject],
                };
              }
              return t;
            }),
          };
        });
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
        setSelectedProjectId(createdProject.id);
      }

      setIsCreateModalOpen(false);
      setFeedback({ type: 'success', message: 'Project created.' });
    } catch (error) {
      setProjectCreateError(error instanceof Error ? error.message : 'Failed to create project.');
    } finally {
      setProjectCreateLoading(false);
    }
  };

  const handleSaveProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProject) {
      return;
    }

    const { url: githubRepoUrl, error } = validateGithubRepoUrl(projectDraft.githubRepoUrl);
    if (error) {
      setFeedback({ type: 'error', message: error });
      return;
    }

    setSavingProjectId(selectedProject.id);
    setFeedback(null);

    // Optimistically update the sidebar tree while the request is in-flight.
    queryClient.setQueryData<SidebarTree | undefined>(['sidebarTree', workspaceId], (current) => {
      if (!current) return current;
      return {
        ...current,
        teams: current.teams.map((t) => {
          if (t.id === team?.id) {
            return {
              ...t,
              projects: t.projects?.map((p) =>
                p.id === selectedProject.id ? { ...p, name: projectDraft.name.trim() } : p
              ),
            };
          }
          return t;
        }),
      };
    });

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
        setFeedback({ type: 'success', message: 'Project updated.' });
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
      })
      .catch((error) => {
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to update project.',
        });
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
    if (!selectedProject || !onDeleteProject) return;
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedProject || !onDeleteProject) return;

    const projectId = selectedProject.id;
    setIsDeleteModalOpen(false);
    setDeletingProjectId(projectId);
    setFeedback(null);

    // Optimistically update sidebar tree
    queryClient.setQueryData<SidebarTree | undefined>(['sidebarTree', workspaceId], (current) => {
      if (!current) return current;
      return {
        ...current,
        teams: current.teams.map((t) => {
          if (t.id === team?.id) {
            return {
              ...t,
              projects: (t.projects || []).filter((p) => p.id !== projectId),
            };
          }
          return t;
        }),
      };
    });

    setFeedback({ type: 'success', message: 'Project deleted successfully.' });

    const remainingProjects = sortedProjects.filter(p => p.id !== projectId);
    if (remainingProjects.length > 0) {
      setSelectedProjectId(remainingProjects[0].id);
    } else {
      setSelectedProjectId('');
    }

    // Fire and forget
    onDeleteProject(projectId).catch((error) => {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete project.',
      });
      void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
    }).finally(() => {
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

          <div className="workspace-team-projects-page__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onBackToTeams}>
              <ArrowLeft size={14} />
              <span>Back to Teams</span>
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)} disabled={!team}>
              <Sparkles size={14} />
              <span>New Project</span>
            </Button>
          </div>
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className="workspace-team-projects-page__content">
        <section className="workspace-team-projects-page__hero">
          <div>
            <div className="workspace-team-projects-page__eyebrow">Team projects</div>
            <div className="workspace-team-projects-page__hero-header">
              <h2>{team?.name ?? 'Loading team...'}</h2>
              <div className="workspace-team-projects-page__hero-meta">
                <span className="workspace-team-projects-page__hero-pill">{sortedProjects.length} projects</span>
                <span className="workspace-team-projects-page__hero-pill">{workspaceName}</span>
              </div>
            </div>
            <p className="workspace-team-projects-page__hero-description">
              {team?.description || 'Create and refine the projects owned by this team without leaving team management.'}
            </p>
          </div>

          <div className="workspace-team-projects-page__hero-stat">
            <FolderKanban size={18} />
            <span>{sortedProjects.length}</span>
            <small>{sortedProjects.length === 1 ? 'project' : 'projects'}</small>
          </div>
        </section>

        {feedback ? (
          <div className={`workspace-team-projects-page__feedback workspace-team-projects-page__feedback--${feedback.type}`}>
            {feedback.message}
          </div>
        ) : null}

        {loading ? (
          <div className="workspace-team-projects-page__layout">
            <div className="workspace-team-projects-page__projects-card" style={{ padding: 'var(--space-lg) var(--space-md)' }}>
              <Skeleton variant="text" width="40%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
              <div className="workspace-team-projects-page__project-list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="workspace-team-projects-page__project-card" style={{ cursor: 'default' }}>
                    <Skeleton variant="text" width="30%" height={14} style={{ marginBottom: 'var(--space-xs)' }} />
                    <Skeleton variant="text" width="60%" height={18} />
                    <Skeleton variant="text" width="80%" height={12} />
                  </div>
                ))}
              </div>
            </div>
            <div className="workspace-team-projects-page__editor-card" style={{ padding: 'var(--space-md)' }}>
              <Skeleton variant="text" width="30%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
              <Skeleton variant="rect" width="100%" height={150} />
            </div>
          </div>
        ) : (
          <div className="workspace-team-projects-page__layout">
            <section className="workspace-team-projects-page__projects-card" aria-label="Team projects">
              <div className="workspace-team-projects-page__section-header">
                <div>
                  <div className="workspace-team-projects-page__section-kicker">Project roster</div>
                  <h3>{team?.name ?? 'Team'} projects</h3>
                </div>
                <p>Pick a project to edit, or create a new one for this team.</p>
              </div>

              {sortedProjects.length === 0 ? (
                <div className="workspace-team-projects-page__empty">
                  <div className="workspace-team-projects-page__empty-title">No projects in this team yet</div>
                  <p>Use New Project to create the first project for {team?.name ?? 'this team'}.</p>
                </div>
              ) : (
                <div className="workspace-team-projects-page__project-list">
                  {sortedProjects.map((project) => {
                    const isSelected = selectedProject?.id === project.id;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        className={isSelected
                          ? 'workspace-team-projects-page__project-card workspace-team-projects-page__project-card--active'
                          : 'workspace-team-projects-page__project-card'}
                        onClick={() => handleSelectProject(project.id)}
                      >
                        <div className="workspace-team-projects-page__project-card-top">
                          <span className="workspace-team-projects-page__project-key">{project.key}</span>
                          <span className={`workspace-team-projects-page__project-status workspace-team-projects-page__project-status--${project.status}`}>
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
                    );
                  })}
                </div>
              )}
            </section>

            <section className="workspace-team-projects-page__editor-card" aria-label="Project editor">
              {selectedProject ? (
                <>
                  <div className="workspace-team-projects-page__section-header">
                    <div>
                      <div className="workspace-team-projects-page__section-kicker">Project editor</div>
                      <h3>{selectedProject.name}</h3>
                    </div>
                    <p>Update the project details that shape how this team ships work.</p>
                  </div>

                  <form className="workspace-team-projects-page__form" aria-label="Project editor" onSubmit={handleSaveProject}>
                    <div className="workspace-team-projects-page__form-fields">
                      <div className="workspace-team-projects-page__field-grid">
                        <TextInput
                          label="Project Name"
                          value={projectDraft.name}
                          onChange={(event) => setProjectDraft((draft) => ({ ...draft, name: event.target.value }))}
                          placeholder="Core Platform"
                          required
                        />

                        <TextInput
                          label="GitHub Repository URL"
                          value={projectDraft.githubRepoUrl}
                          onChange={(event) => setProjectDraft((draft) => ({ ...draft, githubRepoUrl: event.target.value }))}
                          placeholder="https://github.com/owner/repo"
                        />
                      </div>

                      <Textarea
                        label="Description"
                        value={projectDraft.description}
                        onChange={(event) => setProjectDraft((draft) => ({ ...draft, description: event.target.value }))}
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
                            onClick={() => setProjectDraft((draft) => ({ ...draft, status: option.value as Project['status'] }))}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>

                      <div className="workspace-team-projects-page__meta">
                        <span className="workspace-team-projects-page__meta-pill">Key: {selectedProject.key}</span>
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
                          loading={savingProjectId === selectedProject.id}
                          disabled={savingProjectId === selectedProject.id || deletingProjectId === selectedProject.id}
                        >
                          <Save size={13} />
                          <span>Save Project</span>
                        </Button>

                        <Button type="button" variant="secondary" size="sm" onClick={handleResetDraft} disabled={savingProjectId === selectedProject.id || deletingProjectId === selectedProject.id}>
                          Reset
                        </Button>
                      </div>

                      {onDeleteProject && (
                        <div className="workspace-team-projects-page__actions-right" style={{ marginLeft: 'auto' }}>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            loading={deletingProjectId === selectedProject.id}
                            disabled={savingProjectId === selectedProject.id || deletingProjectId === selectedProject.id}
                            onClick={handleDeleteProject}
                          >
                            <Trash size={13} />
                            <span>Delete</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </form>
                </>
              ) : (
                <div className="workspace-team-projects-page__empty">
                  <div className="workspace-team-projects-page__empty-title">No project selected</div>
                  <p>Select a project or create the first one for {team?.name ?? 'this team'}.</p>
                </div>
              )}
            </section>
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
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Project"
        >
          <div style={{ padding: '16px 20px', color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
            <p>
              Are you sure you want to delete the project <strong>{selectedProject.name}</strong>?
            </p>
            <p style={{ marginTop: 8 }}>
              This action is permanent and will delete all associated tickets and comments.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                Delete Project
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
