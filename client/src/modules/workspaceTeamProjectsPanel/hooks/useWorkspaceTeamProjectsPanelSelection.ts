import { type Dispatch, type SetStateAction } from 'react';
import { useListSelection } from '../../../hooks/useListSelection';
import type { Project } from '../../../types/domain';

interface UseWorkspaceTeamProjectsPanelSelectionArgs {
  projects: Project[];
  activeProjectId: string;
}

export interface UseWorkspaceTeamProjectsPanelSelectionResult {
  selectedProjectId: string;
  setSelectedProjectId: Dispatch<SetStateAction<string>>;
  selectedProject: Project | null;
}

export function useWorkspaceTeamProjectsPanelSelection({
  projects,
  activeProjectId,
}: UseWorkspaceTeamProjectsPanelSelectionArgs): UseWorkspaceTeamProjectsPanelSelectionResult {
  const { selectedItemId, setSelectedItemId, selectedItem } = useListSelection<Project>({
    items: projects,
    activeItemId: activeProjectId,
  });

  return {
    selectedProjectId: selectedItemId,
    setSelectedProjectId: setSelectedItemId,
    selectedProject: selectedItem,
  };
}
