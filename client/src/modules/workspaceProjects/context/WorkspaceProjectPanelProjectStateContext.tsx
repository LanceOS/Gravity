import { createContext, useContext, type PropsWithChildren } from 'react';

import type { UseWorkspaceProjectPanelProjectStateArgs, UseWorkspaceProjectPanelProjectStateResult } from '../hooks/useWorkspaceProjectPanelProjectState';
import { useWorkspaceProjectPanelProjectState } from '../hooks';

export type WorkspaceProjectPanelProjectStateContextValue = UseWorkspaceProjectPanelProjectStateResult;

const WorkspaceProjectPanelProjectStateContext = createContext<WorkspaceProjectPanelProjectStateContextValue | null>(null);

export function WorkspaceProjectPanelProjectStateProvider({
  children,
  projects,
  activeProjectId,
}: PropsWithChildren<UseWorkspaceProjectPanelProjectStateArgs>): JSX.Element {
  const value = useWorkspaceProjectPanelProjectState({
    projects,
    activeProjectId,
  });

  return <WorkspaceProjectPanelProjectStateContext.Provider value={value}>{children}</WorkspaceProjectPanelProjectStateContext.Provider>;
}

export function useWorkspaceProjectPanelProjectStateContext(): WorkspaceProjectPanelProjectStateContextValue {
  const context = useContext(WorkspaceProjectPanelProjectStateContext);
  if (!context) {
    throw new Error('useWorkspaceProjectPanelProjectStateContext must be used inside WorkspaceProjectPanelProjectStateProvider.');
  }

  return context;
}
