import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const lastSyncedActiveProjectId = useRef(activeProjectId);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (projects.length === 0) {
      setSelectedProjectId('');
      lastSyncedActiveProjectId.current = activeProjectId;
      return;
    }

    const activeProjectExists = !!activeProjectId && projects.some((project) => project.id === activeProjectId);
    const selectedProjectExists = !!selectedProjectId && projects.some((project) => project.id === selectedProjectId);
    const activeProjectChanged = lastSyncedActiveProjectId.current !== activeProjectId;

    if (!selectedProjectExists && activeProjectExists) {
      setSelectedProjectId(activeProjectId);
      lastSyncedActiveProjectId.current = activeProjectId;
      return;
    }

    if (activeProjectChanged && activeProjectExists) {
      setSelectedProjectId(activeProjectId);
      lastSyncedActiveProjectId.current = activeProjectId;
      return;
    }

    if (!selectedProjectExists) {
      setSelectedProjectId(projects[0].id);
    }
    lastSyncedActiveProjectId.current = activeProjectId;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeProjectId, selectedProjectId, projects]);

  return {
    selectedProjectId,
    setSelectedProjectId,
    selectedProject,
  };
}
