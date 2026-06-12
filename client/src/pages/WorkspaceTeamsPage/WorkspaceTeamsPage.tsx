import { useMemo, useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, FolderKanban, Save, Tags, Trash2, Users, Sparkles } from 'lucide-react';
import { Button, Select, TextInput, Textarea, Modal } from '@library';
import { apiClient } from '../../utils/apiClient';
import { WorkspaceHeader } from '../../modules/workspaces';
import type { SidebarTeam, SidebarTree, Team } from '../../types/domain';
import '../WorkspacePage/WorkspacePage.css';
import './WorkspaceTeamsPage.css';

type TeamDraft = {
  name: string;
  description: string;
  color: string;
};

interface WorkspaceTeamsPageProps {
  workspaceId: string;
  workspaceName: string;
  teams: SidebarTeam[];
  loading?: boolean;
  onBackToWorkspace: () => void;
  onManageProjects?: (teamId: string) => void;
  onTeamsChanged?: () => Promise<void> | void;
}

const DEFAULT_TEAM_COLOR = '#3B82F6';

const COLOR_OPTIONS = ['#3B82F6', '#10B981', '#F97316', '#EC4899', '#8B5CF6', '#64748B'];
const TEAM_VIEWS: SidebarTeam['views'] = [
  { id: 'all', name: 'All Tasks', type: 'all' },
  { id: 'timeline', name: 'Timeline', type: 'timeline' },
];

function getInitialDraft(): TeamDraft {
  return {
    name: '',
    description: '',
    color: DEFAULT_TEAM_COLOR,
  };
}

function getTeamReferenceCount(team: SidebarTeam) {
  return (team.projects?.length ?? 0) + (team.cycles?.length ?? 0) + (team.domains?.length ?? 0);
}

function toSidebarTeam(team: Team): SidebarTeam {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    color: team.color,
    views: TEAM_VIEWS,
    cycles: [],
    domains: [],
    projects: [],
  };
}

export function WorkspaceTeamsPage({
  workspaceId,
  workspaceName,
  teams,
  loading = false,
  onBackToWorkspace,
  onManageProjects,
  onTeamsChanged,
}: WorkspaceTeamsPageProps) {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<TeamDraft>(getInitialDraft);
  const [editDraft, setEditDraft] = useState<TeamDraft>(getInitialDraft);
  const [reassignTeamById, setReassignTeamById] = useState<Record<string, string>>({});
  const [savingAction, setSavingAction] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const sortedTeams = useMemo(
    () => [...teams].sort((first, second) => first.name.localeCompare(second.name)),
    [teams]
  );

  const selectedTeam = useMemo(
    () => sortedTeams.find((team) => team.id === selectedTeamId) ?? null,
    [sortedTeams, selectedTeamId]
  );

  // Sync selectedTeamId
  useEffect(() => {
    if (sortedTeams.length === 0) {
      setSelectedTeamId('');
      return;
    }
    const selectedExists = sortedTeams.some((team) => team.id === selectedTeamId);
    if (!selectedExists) {
      setSelectedTeamId(sortedTeams[0].id);
    }
  }, [selectedTeamId, sortedTeams]);

  const prevSelectedTeamIdRef = useRef<string | null>(null);

  // Sync editDraft
  useEffect(() => {
    if (!selectedTeam) {
      return;
    }
    
    if (prevSelectedTeamIdRef.current !== selectedTeam.id) {
      setEditDraft({
        name: selectedTeam.name,
        description: selectedTeam.description ?? '',
        color: selectedTeam.color || DEFAULT_TEAM_COLOR,
      });
      setFeedback(null);
      prevSelectedTeamIdRef.current = selectedTeam.id;
    }
  }, [selectedTeam]);

  const refreshTeams = async () => {
    await queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
    await onTeamsChanged?.();
  };

  const syncSidebarTreeTeam = (teamId: string, updater: (currentTeam: SidebarTeam) => SidebarTeam) => {
    queryClient.setQueryData<SidebarTree | undefined>(['sidebarTree', workspaceId], (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        teams: current.teams.map((team) => (team.id === teamId ? updater(team) : team)),
      };
    });
  };

  const syncSidebarTreeNewTeam = (team: Team) => {
    queryClient.setQueryData<SidebarTree | undefined>(['sidebarTree', workspaceId], (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        teams: [...current.teams, toSidebarTeam(team)],
      };
    });
  };

  const syncSidebarTreeDeletedTeam = (teamId: string) => {
    queryClient.setQueryData<SidebarTree | undefined>(['sidebarTree', workspaceId], (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        teams: current.teams.filter((team) => team.id !== teamId),
      };
    });
  };

  const handleCreateTeam = async () => {
    const name = createDraft.name.trim();
    if (!name) {
      setFeedback({ type: 'error', message: 'Team name is required.' });
      return;
    }

    setSavingAction('create');
    setFeedback(null);

    try {
      const createdTeam = await apiClient.post<Team>('/teams', {
        workspaceId,
        name,
        description: createDraft.description.trim(),
        color: createDraft.color,
      });
      syncSidebarTreeNewTeam(createdTeam);
      setCreateDraft(getInitialDraft());
      setFeedback({ type: 'success', message: 'Team created.' });
      setIsCreateModalOpen(false);
      setSelectedTeamId(createdTeam.id);
      await refreshTeams();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create team.',
      });
    } finally {
      setSavingAction('');
    }
  };

  const handleUpdateTeam = (teamId: string) => {
    const name = editDraft.name.trim();
    if (!name) {
      setFeedback({ type: 'error', message: 'Team name is required.' });
      return;
    }

    setSavingAction(`update:${teamId}`);
    setFeedback(null);

    const description = editDraft.description.trim();
    const color = editDraft.color;

    // Optimistically update the cache
    syncSidebarTreeTeam(teamId, (currentTeam) => ({
      ...currentTeam,
      name,
      description,
      color,
    }));
    
    setFeedback({ type: 'success', message: 'Team updated.' });
    setSavingAction('');

    // Make the request in the background
    apiClient
      .patch<Team>(`/teams/${teamId}`, { name, description, color })
      .then(() => {
        // Silently reload components by invalidating the query
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
      })
      .catch((error) => {
        // Revert cache on failure by refetching
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to update team.',
        });
      });
  };

  const handleDeleteTeam = async (team: SidebarTeam) => {
    const reassignOptions = sortedTeams.filter((candidate) => candidate.id !== team.id);
    const reassignTeamId = reassignTeamById[team.id] || undefined;
    const hasReferences = getTeamReferenceCount(team) > 0;
    const canDeleteWithoutReassign = reassignOptions.length === 0;
    const effectiveReassignTeamId = canDeleteWithoutReassign ? undefined : reassignTeamId;

    if (hasReferences && !effectiveReassignTeamId && !canDeleteWithoutReassign) {
      setFeedback({ type: 'error', message: 'Choose a reassignment team before deleting a team that owns work.' });
      return;
    }

    setSavingAction(`delete:${team.id}`);
    setFeedback(null);

    try {
      if (effectiveReassignTeamId) {
        await apiClient.delete(`/teams/${team.id}`, {
          params: { reassignTeamId: effectiveReassignTeamId },
        });
      } else {
        await apiClient.delete(`/teams/${team.id}`);
      }
      syncSidebarTreeDeletedTeam(team.id);
      setSelectedTeamId('');
      setFeedback({ type: 'success', message: 'Team deleted.' });
      await refreshTeams();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete team.',
      });
    } finally {
      setSavingAction('');
    }
  };

  // Keyboard shortcut listener for the Create Modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCreateModalOpen) return;
      if (event.key === 'Escape') {
        setIsCreateModalOpen(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleCreateTeam();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, createDraft]);

  const createModalFooter = (
    <div className="workspace-teams-page__modal-footer">
      <span className="workspace-teams-page__modal-hint">
        Ctrl/Cmd + Enter creates the team.
      </span>
      <div className="workspace-teams-page__modal-actions">
        <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} disabled={savingAction === 'create'}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={handleCreateTeam} disabled={savingAction === 'create'}>
          <Users size={14} style={{ marginRight: '6px' }} />
          <span>{savingAction === 'create' ? 'Creating...' : 'Create Team'}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="workspace-page workspace-teams-page">
      <WorkspaceHeader>
        <WorkspaceHeader.Top>
          <WorkspaceHeader.Title>Manage Teams</WorkspaceHeader.Title>

          <div className="workspace-teams-page__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onBackToWorkspace}>
              <ArrowLeft size={14} />
              <span>Back to Workspace</span>
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Sparkles size={14} />
              <span>New Team</span>
            </Button>
          </div>
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className="workspace-teams-page__content">
        <section className="workspace-teams-page__hero">
          <div>
            <div className="workspace-teams-page__eyebrow">Team workspace</div>
            <div className="workspace-teams-page__hero-header">
              <h2>{workspaceName}</h2>
              <div className="workspace-teams-page__hero-meta">
                <span className="workspace-teams-page__hero-pill">{sortedTeams.length} teams</span>
                <span className="workspace-teams-page__hero-pill">{workspaceName}</span>
              </div>
            </div>
            <p className="workspace-teams-page__hero-description">
              Manage the teams that organize projects, cycles, labels, and aggregate task views in this workspace.
            </p>
          </div>
          <div className="workspace-teams-page__hero-stat">
            <Users size={18} />
            <span>{sortedTeams.length}</span>
            <small>{sortedTeams.length === 1 ? 'team' : 'teams'}</small>
          </div>
        </section>

        {feedback ? (
          <div className={`workspace-teams-page__feedback workspace-teams-page__feedback--${feedback.type}`}>
            {feedback.message}
          </div>
        ) : null}

        {loading ? (
          <div className="workspace-teams-page__empty-shell">Loading teams...</div>
        ) : (
          <div className="workspace-teams-page__layout">
            <section className="workspace-teams-page__teams-card" aria-label="Teams roster">
              <div className="workspace-teams-page__section-header">
                <div>
                  <div className="workspace-teams-page__section-kicker">Team roster</div>
                  <h3>Workspace teams</h3>
                </div>
                <p>Pick a team to edit or view its projects, or create a new one.</p>
              </div>

              {sortedTeams.length === 0 ? (
                <div className="workspace-teams-page__empty">
                  <div className="workspace-teams-page__empty-title">No teams in this workspace yet</div>
                  <p>Create your first team to get started.</p>
                </div>
              ) : (
                <div className="workspace-teams-page__team-list">
                  {sortedTeams.map((team) => {
                    const isSelected = selectedTeam?.id === team.id;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        className={isSelected
                          ? 'workspace-teams-page__team-card-item workspace-teams-page__team-card-item--active'
                          : 'workspace-teams-page__team-card-item'}
                        onClick={() => {
                          setSelectedTeamId(team.id);
                          setFeedback(null);
                        }}
                      >
                        <div className="workspace-teams-page__team-card-item-top">
                          <span
                            className="workspace-teams-page__team-color"
                            style={{ background: team.color || DEFAULT_TEAM_COLOR }}
                          />
                          <span className="workspace-teams-page__team-name">{team.name}</span>
                        </div>

                        <div className="workspace-teams-page__team-card-item-body">
                          <p>{team.description || 'No description added yet.'}</p>
                        </div>

                        <div className="workspace-teams-page__team-card-item-footer">
                          <div className="workspace-teams-page__team-metrics">
                            <span><FolderKanban size={11} />{team.projects?.length ?? 0}</span>
                            <span><CalendarDays size={11} />{team.cycles?.length ?? 0}</span>
                            <span><Tags size={11} />{team.domains?.length ?? 0}</span>
                          </div>
                          <span className="workspace-teams-page__team-card-item-action-text">{isSelected ? 'Selected' : 'Click to edit'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="workspace-teams-page__editor-card" aria-label="Team editor">
              {selectedTeam ? (
                <>
                  <div className="workspace-teams-page__section-header">
                    <div>
                      <div className="workspace-teams-page__section-kicker">Team editor</div>
                      <h3>{selectedTeam.name} Details</h3>
                    </div>
                    <p>Update team name, description, color, or view its assigned projects.</p>
                  </div>

                  <form
                    className="workspace-teams-page__form"
                    aria-label="Team editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleUpdateTeam(selectedTeam.id);
                    }}
                  >
                    <div className="workspace-teams-page__form-grid">
                      <div className="workspace-teams-page__form-main">
                        <TextInput
                          label="Team Name"
                          aria-label="Team name"
                          value={editDraft.name}
                          onChange={(event) => setEditDraft((draft) => ({ ...draft, name: event.target.value }))}
                          placeholder="Engineering"
                          required
                        />

                        <Textarea
                          label="Description"
                          aria-label="Team description"
                          value={editDraft.description}
                          onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))}
                          placeholder="Describe this team's ownership"
                          className="workspace-teams-page__description-field"
                          autoGrow={false}
                          inputStyle={{ resize: 'none' }}
                        />
                      </div>

                      <div className="workspace-teams-page__form-sidebar">
                        <div className="workspace-teams-page__color-section">
                          <span className="workspace-teams-page__color-label">Team Color</span>
                          <div className="workspace-teams-page__color-row" aria-label="Edit team color">
                            {COLOR_OPTIONS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                aria-label={`Use team color ${color}`}
                                className={editDraft.color === color ? 'workspace-teams-page__color-swatch workspace-teams-page__color-swatch--active' : 'workspace-teams-page__color-swatch'}
                                style={{ background: color }}
                                onClick={() => setEditDraft((draft) => ({ ...draft, color }))}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="workspace-teams-page__projects-section">
                          <span className="workspace-teams-page__projects-label">Projects</span>
                          <div className="workspace-teams-page__project-list">
                            {(selectedTeam.projects?.length ?? 0) > 0 ? (
                              selectedTeam.projects?.map((project) => (
                                <span key={project.id} className="workspace-teams-page__project-pill">
                                  {project.key} · {project.name}
                                </span>
                              ))
                            ) : (
                              <span className="workspace-teams-page__muted">No projects assigned yet.</span>
                            )}
                          </div>
                          {onManageProjects ? (
                            <div style={{ marginTop: '8px' }}>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => onManageProjects(selectedTeam.id)}
                              >
                                <FolderKanban size={13} />
                                <span>Manage Projects</span>
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="workspace-teams-page__meta-section">
                          <span className="workspace-teams-page__meta-label">Team Stats</span>
                          <div className="workspace-teams-page__meta">
                            <span className="workspace-teams-page__meta-pill">Cycles: {selectedTeam.cycles?.length ?? 0}</span>
                            <span className="workspace-teams-page__meta-pill">Labels: {selectedTeam.domains?.length ?? 0}</span>
                          </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="workspace-teams-page__danger-zone-wrapper">
                          <span className="workspace-teams-page__danger-zone-title">Danger Zone</span>
                          <div className="workspace-teams-page__danger-zone-content">
                            {(() => {
                              const referenceCount = getTeamReferenceCount(selectedTeam);
                              const reassignOptions = sortedTeams.filter((candidate) => candidate.id !== selectedTeam.id);
                              const selectedReassignTeamId = reassignTeamById[selectedTeam.id] ?? '';
                              const showReassignField = referenceCount > 0 && reassignOptions.length > 0;
                              const showLastTeamWarning = referenceCount > 0 && reassignOptions.length === 0;
                              const deleteDisabled = referenceCount > 0 && reassignOptions.length > 0 && !selectedReassignTeamId;

                              return (
                                <>
                                  {showReassignField ? (
                                    <div className="workspace-teams-page__reassign-field">
                                      <span id={`${selectedTeam.id}-reassign-label`} style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                        Reassign owned work before delete
                                      </span>
                                      <Select
                                        aria-labelledby={`${selectedTeam.id}-reassign-label`}
                                        className="workspace-teams-page__reassign-select"
                                        value={selectedReassignTeamId}
                                        placeholder="Choose a team"
                                        options={reassignOptions.map((candidate) => ({
                                          value: candidate.id,
                                          label: candidate.name,
                                          color: candidate.color,
                                        }))}
                                        onValueChange={(nextTeamId) => {
                                          setReassignTeamById((current) => ({ ...current, [selectedTeam.id]: nextTeamId }));
                                        }}
                                        style={{ width: '100%' }}
                                      />
                                    </div>
                                  ) : null}

                                  {showLastTeamWarning ? (
                                    <div className="workspace-teams-page__danger-note">
                                      This is the last team in the workspace. Deleting it will permanently remove its projects and related work.
                                    </div>
                                  ) : null}

                                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                                    <Button
                                      type="button"
                                      variant="danger"
                                      size="sm"
                                      onClick={() => handleDeleteTeam(selectedTeam)}
                                      disabled={deleteDisabled || savingAction === `delete:${selectedTeam.id}`}
                                    >
                                      <Trash2 size={13} />
                                      <span>{savingAction === `delete:${selectedTeam.id}` ? 'Deleting...' : 'Delete Team'}</span>
                                    </Button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="workspace-teams-page__actions-row">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={savingAction === `update:${selectedTeam.id}`}
                      >
                        <Save size={13} />
                        <span>{savingAction === `update:${selectedTeam.id}` ? 'Saving...' : 'Save Team'}</span>
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="workspace-teams-page__empty">
                  <div className="workspace-teams-page__empty-title">No team selected</div>
                  <p>Select a team from the roster to view or edit details.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {isCreateModalOpen ? (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create New Team"
          footer={createModalFooter}
          style={{ maxWidth: '500px' }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateTeam();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
          >
            <TextInput
              label="Team Name"
              placeholder="Engineering"
              value={createDraft.name}
              onChange={(event) => setCreateDraft((draft) => ({ ...draft, name: event.target.value }))}
              autoFocus
              required
              disabled={savingAction === 'create'}
            />

            <Textarea
              label="Description"
              placeholder="Owns product delivery and platform work"
              value={createDraft.description}
              onChange={(event) => setCreateDraft((draft) => ({ ...draft, description: event.target.value }))}
              rows={4}
              disabled={savingAction === 'create'}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Team Color</span>
              <div className="workspace-teams-page__color-row" aria-label="Team color">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use team color ${color}`}
                    className={createDraft.color === color ? 'workspace-teams-page__color-swatch workspace-teams-page__color-swatch--active' : 'workspace-teams-page__color-swatch'}
                    style={{ background: color }}
                    onClick={() => setCreateDraft((draft) => ({ ...draft, color }))}
                  />
                ))}
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
