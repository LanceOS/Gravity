import { useState, type Dispatch, type SetStateAction } from 'react';
import { getProjectDraft } from '../utils/WorkspaceTeamProjectsPanelUtils';
import type { Project } from '../../../types/domain';
import type { WorkspaceTeamProjectsPanelDraft } from '../types/WorkspaceTeamProjectsPanel';
import { useSyncedDraftState } from '../../../hooks/useSyncedDraft';

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
  const {
    draft: projectDraft,
    setDraft: setProjectDraft,
    resetDraft: resetProjectDraft,
    resetDraftToItem: resetProjectDraftToProject,
  } = useSyncedDraftState<Project, WorkspaceTeamProjectsPanelDraft>({
    selectedItem: selectedProject,
    getDefaultDraft: getProjectDraft,
    getDraftFromItem: getProjectDraft,
  });

  return {
    projectDraft,
    setProjectDraft,
    resetProjectDraft,
    resetProjectDraftToProject,
  };
}
