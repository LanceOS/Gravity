import { useState, type Dispatch, type SetStateAction } from 'react';
import { getInitialDraft } from '../utils/WorkspaceTeamsPage';
import type { TeamDraft } from '../types/WorkspaceTeamsPage';
import type { SidebarTeam } from '../../../types/domain';
import { useSyncedDraftState } from '../../../hooks/useSyncedDraft';

interface UseWorkspaceTeamsPageDraftArgs {
  selectedTeam: SidebarTeam | null;
}

export interface UseWorkspaceTeamsPageDraftResult {
  createDraft: TeamDraft;
  editDraft: TeamDraft;
  setCreateDraft: Dispatch<SetStateAction<TeamDraft>>;
  setEditDraft: Dispatch<SetStateAction<TeamDraft>>;
  resetEditDraft: () => void;
}

export function useWorkspaceTeamsPageDraft({
  selectedTeam,
}: UseWorkspaceTeamsPageDraftArgs): UseWorkspaceTeamsPageDraftResult {
  const [createDraft, setCreateDraft] = useState<TeamDraft>(getInitialDraft);
  const { draft: editDraft, setDraft: setEditDraft, resetDraft: resetEditDraft } = useSyncedDraftState<SidebarTeam, TeamDraft>({
    selectedItem: selectedTeam,
    getDefaultDraft: getInitialDraft,
    getDraftFromItem: (team) => {
      if (!team) {
        return getInitialDraft();
      }

      return {
        name: team.name,
        description: team.description ?? '',
        color: team.color || getInitialDraft().color,
      };
    },
  });

  return {
    createDraft,
    editDraft,
    setCreateDraft,
    setEditDraft,
    resetEditDraft,
  };
}
