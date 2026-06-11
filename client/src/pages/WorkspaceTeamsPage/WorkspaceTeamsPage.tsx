import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, FolderKanban, Save, Tags, Trash2, Users } from 'lucide-react';
import { Button, Select } from '@library';
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
  onTeamsChanged,
}: WorkspaceTeamsPageProps) {
  const queryClient = useQueryClient();
  const [createDraft, setCreateDraft] = useState<TeamDraft>(getInitialDraft);
  const [editingTeamId, setEditingTeamId] = useState('');
  const [editDraft, setEditDraft] = useState<TeamDraft>(getInitialDraft);
  const [reassignTeamById, setReassignTeamById] = useState<Record<string, string>>({});
  const [savingAction, setSavingAction] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const sortedTeams = useMemo(
    () => [...teams].sort((first, second) => first.name.localeCompare(second.name)),
    [teams]
  );

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

  const handleStartEdit = (team: SidebarTeam) => {
    setEditingTeamId(team.id);
    setEditDraft({
      name: team.name,
      description: team.description ?? '',
      color: team.color || DEFAULT_TEAM_COLOR,
    });
    setFeedback(null);
  };

  const handleUpdateTeam = async (teamId: string) => {
    const name = editDraft.name.trim();
    if (!name) {
      setFeedback({ type: 'error', message: 'Team name is required.' });
      return;
    }

    setSavingAction(`update:${teamId}`);
    setFeedback(null);

    try {
      const updatedTeam = await apiClient.patch<Team>(`/teams/${teamId}`, {
        name,
        description: editDraft.description.trim(),
        color: editDraft.color,
      });
      syncSidebarTreeTeam(teamId, (currentTeam) => ({
        ...currentTeam,
        ...updatedTeam,
      }));
      setEditingTeamId('');
      setFeedback({ type: 'success', message: 'Team updated.' });
      await refreshTeams();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update team.',
      });
    } finally {
      setSavingAction('');
    }
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
          </div>
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className="workspace-teams-page__content">
        <section className="workspace-teams-page__hero">
          <div>
            <div className="workspace-teams-page__eyebrow">Team workspace</div>
            <h2>{workspaceName}</h2>
            <p>
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

        <section className="workspace-teams-page__create-card" aria-label="Create team">
          <div>
            <div className="workspace-teams-page__section-kicker">New team</div>
            <h3>Create a focused team</h3>
            <p>Teams become the top-level navigation grouping for work in this workspace.</p>
          </div>

          <div className="workspace-teams-page__form-grid">
            <label>
              <span>Name</span>
              <input
                value={createDraft.name}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="Engineering"
              />
            </label>
            <label>
              <span>Description</span>
              <input
                value={createDraft.description}
                onChange={(event) => setCreateDraft((draft) => ({ ...draft, description: event.target.value }))}
                placeholder="Owns product delivery and platform work"
              />
            </label>
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
            <Button type="button" variant="primary" onClick={handleCreateTeam} disabled={savingAction === 'create'}>
              <Users size={14} />
              <span>{savingAction === 'create' ? 'Creating...' : 'Create Team'}</span>
            </Button>
          </div>
        </section>

        <section className="workspace-teams-page__team-grid" aria-label="Teams">
          {loading ? (
            <div className="workspace-teams-page__empty">Loading teams...</div>
          ) : sortedTeams.length === 0 ? (
            <div className="workspace-teams-page__empty">Create your first team to get started.</div>
          ) : (
            sortedTeams.map((team) => {
              const isEditing = editingTeamId === team.id;
              const referenceCount = getTeamReferenceCount(team);
              const reassignOptions = sortedTeams.filter((candidate) => candidate.id !== team.id);
              const selectedReassignTeamId = reassignTeamById[team.id] ?? '';
              const showReassignField = referenceCount > 0 && reassignOptions.length > 0;
              const showLastTeamWarning = referenceCount > 0 && reassignOptions.length === 0;
              const deleteDisabled = referenceCount > 0 && reassignOptions.length > 0 && !selectedReassignTeamId;

              return (
                <article key={team.id} className="workspace-teams-page__team-card">
                  <div className="workspace-teams-page__team-card-header">
                    <div className="workspace-teams-page__team-title-row">
                      <span
                        className="workspace-teams-page__team-color"
                        style={{ background: (isEditing ? editDraft.color : team.color) || DEFAULT_TEAM_COLOR }}
                      />
                      {isEditing ? (
                        <input
                          aria-label="Team name"
                          value={editDraft.name}
                          onChange={(event) => setEditDraft((draft) => ({ ...draft, name: event.target.value }))}
                        />
                      ) : (
                        <h3>{team.name}</h3>
                      )}
                    </div>
                    <div className="workspace-teams-page__team-actions">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => handleUpdateTeam(team.id)}
                            disabled={savingAction === `update:${team.id}`}
                          >
                            <Save size={13} />
                            <span>Save</span>
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setEditingTeamId('')}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" onClick={() => handleStartEdit(team)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <textarea
                      aria-label="Team description"
                      value={editDraft.description}
                      onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))}
                      placeholder="Describe this team's ownership"
                    />
                  ) : (
                    <p className="workspace-teams-page__team-description">
                      {team.description || 'No team description yet.'}
                    </p>
                  )}

                  {isEditing ? (
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
                  ) : null}

                  <div className="workspace-teams-page__metrics">
                    <span><FolderKanban size={13} />{team.projects?.length ?? 0} Projects</span>
                    <span><CalendarDays size={13} />{team.cycles?.length ?? 0} Cycles</span>
                    <span><Tags size={13} />{team.domains?.length ?? 0} Labels</span>
                  </div>

                  <div className="workspace-teams-page__project-list">
                    {(team.projects?.length ?? 0) > 0 ? (
                      team.projects.map((project) => (
                        <span key={project.id} className="workspace-teams-page__project-pill">
                          {project.key} · {project.name}
                        </span>
                      ))
                    ) : (
                      <span className="workspace-teams-page__muted">No projects assigned yet.</span>
                    )}
                  </div>

                  <div className={showLastTeamWarning ? 'workspace-teams-page__danger-zone workspace-teams-page__danger-zone--last-team' : 'workspace-teams-page__danger-zone'}>
                    {showReassignField ? (
                      <div className="workspace-teams-page__reassign-field">
                        <span id={`${team.id}-reassign-label`}>Reassign owned work before delete</span>
                        <Select
                          aria-labelledby={`${team.id}-reassign-label`}
                          className="workspace-teams-page__reassign-select"
                          value={selectedReassignTeamId}
                          placeholder="Choose a team"
                          options={reassignOptions.map((candidate) => ({
                            value: candidate.id,
                            label: candidate.name,
                            color: candidate.color,
                          }))}
                          onValueChange={(nextTeamId) => {
                            setReassignTeamById((current) => ({ ...current, [team.id]: nextTeamId }));
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
                    <div className="workspace-teams-page__delete-action">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteTeam(team)}
                        disabled={deleteDisabled || savingAction === `delete:${team.id}`}
                      >
                        <Trash2 size={13} />
                        <span>{savingAction === `delete:${team.id}` ? 'Deleting...' : 'Delete Team'}</span>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
