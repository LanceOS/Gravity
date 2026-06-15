import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../utils/apiClient';
import { addSidebarTeam, removeSidebarTeam, updateSidebarTeam } from '../../../utils/sidebarTreeMutations';
import { WorkspaceHeader } from '../../workspaces';
import type { SidebarTeam, Team } from '../../../types/domain';
import '../../workspacePage/styles/WorkspacePage.css';
import '../styles/WorkspaceTeamsPage.css';

import { WorkspaceTeamsCreateTeamModal } from '../components/WorkspaceTeamsCreateTeamModal';
import { WorkspaceTeamsFeedback } from '../components/WorkspaceTeamsFeedback';
import { WorkspaceTeamsHeaderActions } from '../components/WorkspaceTeamsHeaderActions';
import { WorkspaceTeamsHero } from '../components/WorkspaceTeamsHero';
import { WorkspaceTeamsLoadingSkeleton } from '../components/WorkspaceTeamsLoadingSkeleton';
import { WorkspaceTeamsTeamEditorSection } from '../components/WorkspaceTeamsTeamEditorSection';
import { WorkspaceTeamsTeamListSection } from '../components/WorkspaceTeamsTeamListSection';
import { getTeamReferenceCount, getInitialDraft, toSidebarTeam } from '../utils/WorkspaceTeamsPage';
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
    await queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
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
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
      })
      .catch((error) => {
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
    <div className="workspace-page workspace-teams-page">
      <WorkspaceHeader>
        <WorkspaceHeader.Top>
          <WorkspaceHeader.Title>Manage Teams</WorkspaceHeader.Title>
          <WorkspaceTeamsHeaderActions
            onBackToWorkspace={onBackToWorkspace}
            onOpenCreateTeam={() => setIsCreateModalOpen(true)}
          />
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className="workspace-teams-page__content">
        <WorkspaceTeamsHero workspaceName={workspaceName} teamCount={sortedTeams.length} />
        <WorkspaceTeamsFeedback feedback={feedback} />

        {loading ? (
          <WorkspaceTeamsLoadingSkeleton />
        ) : (
          <div className="workspace-teams-page__layout">
            <WorkspaceTeamsTeamListSection
              teams={sortedTeams}
              selectedTeamId={selectedTeamId}
              onSelectTeam={handleSelectTeam}
            />

            <WorkspaceTeamsTeamEditorSection
              selectedTeam={selectedTeam}
              editDraft={editDraft}
              savingAction={savingAction}
              sortedTeams={sortedTeams}
              reassignTeamById={reassignTeamById}
              onSave={handleUpdateTeam}
              onDraftChange={setEditDraft}
              onReassignChange={(teamId, reassignTeamId) =>
                setReassignTeamById((current) => ({ ...current, [teamId]: reassignTeamId }))
              }
              onDelete={handleDeleteTeam}
              onManageProjects={onManageProjects}
            />
          </div>
        )}
      </div>

      <WorkspaceTeamsCreateTeamModal
        isOpen={isCreateModalOpen}
        savingAction={savingAction}
        createDraft={createDraft}
        onClose={() => setIsCreateModalOpen(false)}
        onDraftChange={setCreateDraft}
        onCreateTeam={() => {
          void handleCreateTeam();
        }}
      />
    </div>
  );
}
