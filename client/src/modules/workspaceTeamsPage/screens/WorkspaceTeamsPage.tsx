import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Textarea, TextInput } from '@library';
import { apiClient } from '../../../utils/apiClient';
import { queryKeys } from '../../../utils/queryClient';
import { addSidebarTeam, removeSidebarTeam, updateSidebarTeam } from '../../../utils/sidebarTreeMutations';
import type { SidebarTeam, Team } from '../../../types/domain';
import '../../workspacePage/styles/WorkspacePage.css';
import '../styles/WorkspaceTeamsPage.css';
import { WorkspaceManagementLayout } from '../../../layouts/WorkspaceManagementLayout/WorkspaceManagementLayout';
import {
  WorkspaceManagementFeedback,
  WorkspaceManagementHeaderActions,
  WorkspaceManagementHero,
  WorkspaceManagementLoadingSkeleton,
  WorkspaceManagementEditorSection,
  WorkspaceManagementListSection,
} from '../../../components/WorkspaceManagementPage';

import { WorkspaceTeamsCreateTeamModal } from '../components/WorkspaceTeamsCreateTeamModal';
import { WorkspaceTeamsDangerZone } from '../components/WorkspaceTeamsDangerZone';
import { CalendarDays, FolderKanban, Tags, Users } from 'lucide-react';
import { COLOR_OPTIONS, DEFAULT_TEAM_COLOR, getTeamReferenceCount, getInitialDraft, toSidebarTeam } from '../utils/WorkspaceTeamsPage';
import { useWorkspaceTeamsPageDraft } from '../hooks/useWorkspaceTeamsPageDraft';
import { useWorkspaceTeamsPageSelection } from '../hooks/useWorkspaceTeamsPageSelection';
import { type WorkspaceTeamsPageFeedback, type WorkspaceTeamsPageProps } from '../types/WorkspaceTeamsPage';

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

  const sortedTeams = useMemo(
    () => [...teams].sort((first, second) => first.name.localeCompare(second.name)),
    [teams],
  );

  const { selectedTeamId, setSelectedTeamId, selectedTeam } = useWorkspaceTeamsPageSelection({
    teams: sortedTeams,
  });

  const { createDraft, editDraft, setCreateDraft, setEditDraft } = useWorkspaceTeamsPageDraft({
    selectedTeam,
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [reassignTeamById, setReassignTeamById] = useState<Record<string, string>>({});
  const [savingAction, setSavingAction] = useState('');
  const [feedback, setFeedback] = useState<WorkspaceTeamsPageFeedback | null>(null);

  const lastSelectedTeamIdRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === 'true') {
      setIsCreateModalOpen(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    if (!selectedTeam) {
      lastSelectedTeamIdRef.current = null;
      return;
    }

    if (selectedTeam.id === lastSelectedTeamIdRef.current) {
      return;
    }

    setFeedback(null);
    lastSelectedTeamIdRef.current = selectedTeam.id;
  }, [selectedTeam]);

  const refreshTeams = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });
    await onTeamsChanged?.();
  };

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setFeedback(null);
  };

  const handleCreateTeamRef = useRef<() => Promise<void>>(async () => undefined);

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
      addSidebarTeam(queryClient, workspaceId, toSidebarTeam(createdTeam));
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

  handleCreateTeamRef.current = handleCreateTeam;

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

    updateSidebarTeam(queryClient, workspaceId, teamId, (currentTeam) => ({
      ...currentTeam,
      name,
      description,
      color,
    }));

    setFeedback({ type: 'success', message: 'Team updated.' });
    setSavingAction('');

    apiClient
      .patch<Team>(`/teams/${teamId}`, { name, description, color })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });
      })
      .catch((error) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId) });
        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to update team.',
        });
      });
  };

  const handleReassignChange = (teamId: string, reassignTeamId: string) => {
    setReassignTeamById((next) => ({
      ...next,
      [teamId]: reassignTeamId,
    }));
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
      removeSidebarTeam(queryClient, workspaceId, team.id);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCreateModalOpen) {
        return;
      }

      if (event.key === 'Escape') {
        setIsCreateModalOpen(false);
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleCreateTeamRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreateModalOpen]);

  return (
    <WorkspaceManagementLayout
      title="Manage Teams"
      pageClassName="workspace-teams-page"
      contentClassName="workspace-teams-page__content"
      actions={
        <WorkspaceManagementHeaderActions
          classNamePrefix="workspace-teams-page"
          onBack={onBackToWorkspace}
          backLabel="Back to Workspace"
          onCreate={() => setIsCreateModalOpen(true)}
          createLabel="New Team"
        />
      }
      hero={
        <WorkspaceManagementHero
          classNamePrefix="workspace-teams-page"
          eyebrow="Team workspace"
          title={workspaceName}
          metaItems={[`${sortedTeams.length} teams`, workspaceName]}
          description="Manage the teams that organize projects, cycles, labels, and aggregate task views in this workspace."
          StatIcon={Users}
          statValue={sortedTeams.length}
          statSingularLabel="team"
          statPluralLabel="teams"
        />
      }
      feedback={<WorkspaceManagementFeedback classNamePrefix="workspace-teams-page" feedback={feedback} />}
      loading={loading}
      loadingNode={
        <WorkspaceManagementLoadingSkeleton
          layoutClassName="workspace-teams-page__layout"
          cardClassName="workspace-teams-page__teams-card"
          listClassName="workspace-teams-page__team-list"
          itemClassName="workspace-teams-page__team-card-item"
          editorCardClassName="workspace-teams-page__editor-card"
        />
      }
    >
      <div className="workspace-teams-page__layout">
        <WorkspaceManagementListSection
          classNamePrefix="workspace-teams-page"
          sectionClassName="workspace-teams-page__teams-card"
          listClassName="workspace-teams-page__team-list"
          ariaLabel="Teams roster"
          sectionKicker="Team roster"
          sectionTitle="Workspace teams"
          sectionDescription="Pick a team to edit or view its projects, or create a new one."
          items={sortedTeams}
          selectedItemId={selectedTeamId}
          onSelectItem={handleSelectTeam}
          emptyStateTitle="No teams in this workspace yet"
          emptyStateDescription="Create your first team to get started."
          renderItem={({ item: team, isSelected, onSelect }) => (
            <button
              type="button"
              className={
                isSelected
                  ? 'workspace-teams-page__team-card-item workspace-teams-page__team-card-item--active'
                  : 'workspace-teams-page__team-card-item'
              }
              onClick={onSelect}
            >
              <div className="workspace-teams-page__team-card-item-top">
                <span className="workspace-teams-page__team-color" style={{ background: team.color || DEFAULT_TEAM_COLOR }} />
                <span className="workspace-teams-page__team-name">{team.name}</span>
              </div>

              <div className="workspace-teams-page__team-card-item-body">
                <p>{team.description || 'No description added yet.'}</p>
              </div>

              <div className="workspace-teams-page__team-card-item-footer">
                <div className="workspace-teams-page__team-metrics">
                  <span>
                    <FolderKanban size={11} />
                    {team.projects?.length ?? 0}
                  </span>
                  <span>
                    <CalendarDays size={11} />
                    {team.cycles?.length ?? 0}
                  </span>
                  <span>
                    <Tags size={11} />
                    {(team.labels ?? []).length}
                  </span>
                </div>
                <span className="workspace-teams-page__team-card-item-action-text">
                  {isSelected ? 'Selected' : 'Click to edit'}
                </span>
              </div>
            </button>
          )}
        />

        <WorkspaceManagementEditorSection
          classNamePrefix="workspace-teams-page"
          editorClassName="workspace-teams-page__editor-card"
          ariaLabel="Team editor"
          sectionKicker="Team editor"
          sectionDescription="Update team name, description, color, or view its assigned projects."
          selectedItem={selectedTeam}
          emptyStateTitle="No team selected"
          emptyStateDescription="Select a team from the roster to view or edit details."
          getSelectedItemTitle={(team) => `${team.name} Details`}
        >
          {(selectedTeamForEditor) => (
            <form
              className="workspace-teams-page__form"
              aria-label="Team editor"
              onSubmit={(event) => {
                event.preventDefault();
                handleUpdateTeam(selectedTeamForEditor.id);
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
                    placeholder="Describe this team&apos;s ownership"
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
                          className={
                            editDraft.color === color
                              ? 'workspace-teams-page__color-swatch workspace-teams-page__color-swatch--active'
                              : 'workspace-teams-page__color-swatch'
                          }
                          style={{ background: color }}
                          onClick={() => setEditDraft((draft) => ({ ...draft, color }))}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="workspace-teams-page__projects-section">
                    <span className="workspace-teams-page__projects-label">Projects</span>
                    <div className="workspace-teams-page__project-list">
                      {(selectedTeamForEditor.projects?.length ?? 0) > 0 ? (
                        selectedTeamForEditor.projects?.map((project) => (
                          <span key={project.id} className="workspace-teams-page__project-pill">
                            {project.key} · {project.name}
                          </span>
                        ))
                      ) : (
                        <span className="workspace-teams-page__muted">No projects assigned yet.</span>
                      )}
                    </div>
                    {onManageProjects ? (
                      <div className="workspace-teams-page__manage-projects-btn">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onManageProjects(selectedTeamForEditor.id)}
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
                      <span className="workspace-teams-page__meta-pill">Cycles: {selectedTeamForEditor.cycles?.length ?? 0}</span>
                      <span className="workspace-teams-page__meta-pill">
                        Labels: {(selectedTeamForEditor.labels ?? []).length}
                      </span>
                    </div>
                  </div>

                  <div className="workspace-teams-page__danger-zone-wrapper">
                    <span className="workspace-teams-page__danger-zone-title">Danger Zone</span>
                    <div className="workspace-teams-page__danger-zone-content">
                      <WorkspaceTeamsDangerZone
                        selectedTeam={selectedTeamForEditor}
                        sortedTeams={sortedTeams}
                        reassignTeamById={reassignTeamById}
                        savingAction={savingAction}
                        onReassignChange={handleReassignChange}
                        onDelete={handleDeleteTeam}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="workspace-teams-page__actions-row">
                <Button type="submit" variant="primary" size="sm" disabled={savingAction === `update:${selectedTeamForEditor.id}`}>
                  <span>{savingAction === `update:${selectedTeamForEditor.id}` ? 'Saving...' : 'Save Team'}</span>
                </Button>
              </div>
            </form>
          )}
        </WorkspaceManagementEditorSection>

        <WorkspaceTeamsCreateTeamModal
          isOpen={isCreateModalOpen}
          savingAction={savingAction}
          createDraft={createDraft}
          onClose={() => setIsCreateModalOpen(false)}
          onDraftChange={setCreateDraft}
          onCreateTeam={() => void handleCreateTeamRef.current()}
        />
      </div>
    </WorkspaceManagementLayout>
  );
}
