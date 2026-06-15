import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  useEffect(() => {
    if (teams.length === 0) {
      setSelectedTeamId('');
      return;
    }

    const selectedExists = teams.some((team) => team.id === selectedTeamId);
    if (!selectedExists) {
      setSelectedTeamId(teams[0].id);
    }
  }, [selectedTeamId, teams]);

  return {
    selectedTeamId,
    setSelectedTeamId,
    selectedTeam,
  };
}
