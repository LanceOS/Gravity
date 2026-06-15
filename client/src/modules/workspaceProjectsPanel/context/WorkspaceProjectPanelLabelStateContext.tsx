import { type PropsWithChildren } from 'react';

import type { UseWorkspaceProjectPanelLabelStateArgs } from '../hooks/useWorkspaceProjectPanelLabelState';
import { useWorkspaceProjectPanelLabelState } from '../hooks';
import { useWorkspaceProjectPanelProjectStateContext } from './WorkspaceProjectPanelProjectStateContext';
import { WorkspaceProjectPanelLabelStateContext } from './WorkspaceProjectPanelLabelStateContextCore';

export function WorkspaceProjectPanelLabelStateProvider({
  children,
  labels,
}: PropsWithChildren<Pick<UseWorkspaceProjectPanelLabelStateArgs, 'labels'>>): JSX.Element {
  const { managedProject, shouldShowLabels } = useWorkspaceProjectPanelProjectStateContext();
  const value = useWorkspaceProjectPanelLabelState({
    labels,
    managedProject,
    shouldShowLabels,
  });

  return <WorkspaceProjectPanelLabelStateContext.Provider value={value}>{children}</WorkspaceProjectPanelLabelStateContext.Provider>;
}
