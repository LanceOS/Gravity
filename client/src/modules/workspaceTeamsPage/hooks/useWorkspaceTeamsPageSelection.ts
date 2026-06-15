import { type Dispatch, type SetStateAction } from 'react';
import { useListSelection } from '../../../hooks/useListSelection';
import type { SidebarTeam } from '../../../types/domain';

interface UseWorkspaceTeamsPageSelectionArgs {
  teams: SidebarTeam[];
}

export interface UseWorkspaceTeamsPageSelectionResult {
  selectedTeamId: string;
  setSelectedTeamId: Dispatch<SetStateAction<string>>;
  selectedTeam: SidebarTeam | null;
}

export function useWorkspaceTeamsPageSelection({
  teams,
}: UseWorkspaceTeamsPageSelectionArgs): UseWorkspaceTeamsPageSelectionResult {
  const { selectedItemId, setSelectedItemId, selectedItem } = useListSelection<SidebarTeam>({ items: teams });

  return {
    selectedTeamId: selectedItemId,
    setSelectedTeamId: setSelectedItemId,
    selectedTeam: selectedItem,
  };
}
