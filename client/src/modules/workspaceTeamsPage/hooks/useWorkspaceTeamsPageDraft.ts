import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { getInitialDraft } from '../utils/WorkspaceTeamsPage';
import type { TeamDraft } from '../types/WorkspaceTeamsPage';
import type { SidebarTeam } from '../../../types/domain';

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
  const [editDraft, setEditDraft] = useState<TeamDraft>(getInitialDraft);

  const lastSelectedTeamIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedTeam || selectedTeam.id === lastSelectedTeamIdRef.current) {
      return;
    }

    setEditDraft({
      name: selectedTeam.name,
      description: selectedTeam.description ?? '',
      color: selectedTeam.color || getInitialDraft().color,
    });
    lastSelectedTeamIdRef.current = selectedTeam.id;
  }, [selectedTeam]);

  const resetEditDraft = useCallback(() => {
    if (!selectedTeam) {
      setEditDraft(getInitialDraft());
      return;
    }

    setEditDraft({
      name: selectedTeam.name,
      description: selectedTeam.description ?? '',
      color: selectedTeam.color || getInitialDraft().color,
    });
  }, [selectedTeam]);

  return {
    createDraft,
    editDraft,
    setCreateDraft,
    setEditDraft,
    resetEditDraft,
  };
}
