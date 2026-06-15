import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getProjectDraft } from '../utils/WorkspaceTeamProjectsPanelUtils';
import type { Project } from '../../../types/domain';
import type { WorkspaceTeamProjectsPanelDraft } from '../types/WorkspaceTeamProjectsPanel';

interface UseWorkspaceTeamProjectsPanelDraftArgs {
  selectedProject: Project | null;
}

export interface UseWorkspaceTeamProjectsPanelDraftResult {
  projectDraft: WorkspaceTeamProjectsPanelDraft;
  setProjectDraft: Dispatch<SetStateAction<WorkspaceTeamProjectsPanelDraft>>;
  resetProjectDraft: () => void;
  resetProjectDraftToProject: (project: Project | null) => void;
}

export function useWorkspaceTeamProjectsPanelDraft({
  selectedProject,
}: UseWorkspaceTeamProjectsPanelDraftArgs): UseWorkspaceTeamProjectsPanelDraftResult {
  const [projectDraft, setProjectDraft] = useState<WorkspaceTeamProjectsPanelDraft>(getProjectDraft());
  const lastSelectedProjectIdRef = useRef<string | null>(null);

  const syncDraftFromProject = useCallback((project: Project | null) => {
    setProjectDraft(getProjectDraft(project));
    lastSelectedProjectIdRef.current = project?.id ?? null;
  }, []);

  useEffect(() => {
    if (selectedProject?.id === lastSelectedProjectIdRef.current) {
      return;
    }

    syncDraftFromProject(selectedProject);
  }, [selectedProject, syncDraftFromProject]);

  const resetProjectDraft = useCallback(() => {
    syncDraftFromProject(selectedProject);
  }, [selectedProject, syncDraftFromProject]);

  const resetProjectDraftToProject = useCallback(
    (project: Project | null) => {
      syncDraftFromProject(project);
    },
    [syncDraftFromProject],
  );

  return {
    projectDraft,
    setProjectDraft,
    resetProjectDraft,
    resetProjectDraftToProject,
  };
}
