import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, CircularColorInput, Popover, Textarea, TextInput } from '@library';
import { apiClient } from '../../../utils/apiClient';
import { queryKeys } from '../../../utils/queryClient';
import { addLabelToTeam, addSidebarTeam, removeSidebarTeam, updateSidebarTeam } from '../../../utils/sidebarTreeMutations';
import type { SidebarTeam, Team } from '../../../types/domain';
import '../../workspacePage/styles/WorkspacePage.css';
import '../styles/WorkspaceTeamsPage.css';
import { WorkspacePageLayout } from '../../../layouts/WorkspacePageLayout/WorkspacePageLayout';
import { FormSection } from '../../../components/FormSection';
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
import { CalendarDays, FolderKanban, Plus, Tags, Users } from 'lucide-react';
import { COLOR_OPTIONS, DEFAULT_TEAM_COLOR, getTeamReferenceCount, getInitialDraft, toSidebarTeam } from '../utils/WorkspaceTeamsPage';
import { useWorkspaceTeamsPageDraft } from '../hooks/useWorkspaceTeamsPageDraft';
import { useWorkspaceTeamsPageSelection } from '../hooks/useWorkspaceTeamsPageSelection';
import { type WorkspaceTeamsPageFeedback, type WorkspaceTeamsPageProps } from '../types/WorkspaceTeamsPage';

const DEFAULT_TEAM_LABEL_COLOR = '#3B82F6';

interface TeamLabelDraft {
  name: string;
  color: string;
  description: string;
}

function getNextLabelSortOrder(labels: { sortOrder?: number | null }[]) {
  return labels.reduce((max, label) => Math.max(max, Number(label.sortOrder ?? 0)), -1) + 1;
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
  const [isCreateLabelOpen, setIsCreateLabelOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState<TeamLabelDraft>({
    name: '',
    color: DEFAULT_TEAM_LABEL_COLOR,
    description: '',
  });

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
    setLabelDraft({ name: '', color: DEFAULT_TEAM_LABEL_COLOR, description: '' });
    setIsCreateLabelOpen(false);
  }, [selectedTeamId]);

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

  const handleCreateTeamLabel = async (team: SidebarTeam) => {
    const name = labelDraft.name.trim();
    if (!name) {
      setFeedback({ type: 'error', message: 'Label name is required.' });
      return;
    }

    const sortOrder = getNextLabelSortOrder(team.labels ?? []);
    setSavingAction(`create-label:${team.id}`);
    setFeedback(null);

    try {
      const createdLabel = await apiClient.post<{
        id: string;
        name: string;
        color: string;
        description?: string;
        sortOrder?: number;
      }>('/labels', {
        teamId: team.id,
        name,
        color: labelDraft.color,
        description: labelDraft.description.trim(),
        sortOrder,
      });

      addLabelToTeam(queryClient, workspaceId, team.id, {
        id: createdLabel.id,
        name: createdLabel.name,
        color: createdLabel.color,
        description: createdLabel.description ?? '',
        sortOrder: createdLabel.sortOrder ?? sortOrder,
      });

      setLabelDraft({ name: '', color: DEFAULT_TEAM_LABEL_COLOR, description: '' });
      setFeedback({ type: 'success', message: `Created label "${name}" for ${team.name}.` });
      await refreshTeams();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create label.',
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
    <WorkspacePageLayout
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
            <FormSection.Root
              layout="none"
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

                  <div className="workspace-teams-page__labels-section">
                    <span className="workspace-teams-page__labels-title">Team Labels</span>
                    <div className="workspace-teams-page__label-list">
                      {(selectedTeamForEditor.labels ?? []).length > 0 ? (
                        selectedTeamForEditor.labels?.map((label) => (
                          <span key={label.id} className="workspace-teams-page__label-pill">
                            <span className="workspace-teams-page__label-pill-dot" style={{ background: label.color }} />
                            <span>{label.name}</span>
                          </span>
                        ))
                      ) : (
                        <span className="workspace-teams-page__muted">No labels yet.</span>
                      )}
                    </div>

                    <Popover
                      align="left"
                      isOpen={isCreateLabelOpen}
                      onOpenChange={setIsCreateLabelOpen}
                      contentClassName="workspace-teams-page__label-create-body"
                      trigger={
                        <button type="button" className="workspace-teams-page__label-create-trigger">
                          <Plus size={10} />
                          <span>Create Label</span>
                        </button>
                      }
                    >
                      <FormSection.Root
                        layout="none"
                        className="workspace-teams-page__label-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleCreateTeamLabel(selectedTeamForEditor);
                        }}
                      >
                        <TextInput
                          label="New Label Name"
                          aria-label="Label name"
                          value={labelDraft.name}
                          onChange={(event) => setLabelDraft((draft) => ({ ...draft, name: event.target.value }))}
                          placeholder="Frontend"
                          required
                        />

                        <CircularColorInput
                          className="workspace-teams-page__label-color-field"
                          inputClassName="workspace-teams-page__label-color-input"
                          label="Label color"
                          value={labelDraft.color}
                          onChange={(event) => setLabelDraft((draft) => ({ ...draft, color: event.target.value }))}
                        />

                        <Textarea
                          label="Label description"
                          aria-label="Label description"
                          value={labelDraft.description}
                          onChange={(event) =>
                            setLabelDraft((draft) => ({ ...draft, description: event.target.value }))
                          }
                          placeholder="What does this label represent?"
                          rows={2}
                          style={{ gridColumn: '1 / -1', minHeight: '60px' }}
                        />

                        <FormSection.Actions className="workspace-teams-page__label-actions">
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={
                              savingAction === `create-label:${selectedTeamForEditor.id}` || !labelDraft.name.trim()
                            }
                          >
                            {savingAction === `create-label:${selectedTeamForEditor.id}`
                              ? 'Creating...'
                              : 'Create Label'}
                          </Button>
                        </FormSection.Actions>
                      </FormSection.Root>
                    </Popover>
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

              <FormSection.Actions className="workspace-teams-page__actions-row">
                <Button type="submit" variant="primary" size="sm" disabled={savingAction === `update:${selectedTeamForEditor.id}`}>
                  <span>{savingAction === `update:${selectedTeamForEditor.id}` ? 'Saving...' : 'Save Team'}</span>
                </Button>
              </FormSection.Actions>
            </FormSection.Root>
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
    </WorkspacePageLayout>
  );
}
