import { createContext, useContext } from 'react';

import type { UseWorkspaceProjectPanelLabelStateResult } from '../hooks/useWorkspaceProjectPanelLabelState';

export type WorkspaceProjectPanelLabelStateContextValue = UseWorkspaceProjectPanelLabelStateResult;

export const WorkspaceProjectPanelLabelStateContext = createContext<WorkspaceProjectPanelLabelStateContextValue | null>(null);

export function useWorkspaceProjectPanelLabelStateContext(): WorkspaceProjectPanelLabelStateContextValue {
  const context = useContext(WorkspaceProjectPanelLabelStateContext);

  if (!context) {
    throw new Error('useWorkspaceProjectPanelLabelStateContext must be used inside WorkspaceProjectPanelLabelStateProvider.');
  }

  return context;
}
