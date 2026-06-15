import { type ReactNode } from 'react';

import type { Label, Project } from '../../../context/TicketContext';
import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { WorkspaceProjectPanelActionsContextProvider } from './WorkspaceProjectPanelActionsContext';
import { WorkspaceProjectPanelLabelStateProvider } from './WorkspaceProjectPanelLabelStateContext';
import { WorkspaceProjectPanelProjectStateProvider } from './WorkspaceProjectPanelProjectStateContext';

type WorkspaceProjectPanelContextProvidersProps = {
  children: ReactNode;
  projects: Project[];
  activeProjectId: string;
  labels: Label[];
} & Pick<
  WorkspaceProjectPanelProps,
  | 'onSelectProject'
  | 'onCreateProject'
  | 'onUpdateProject'
  | 'onCreateLabel'
  | 'onUpdateLabel'
  | 'onDeleteLabel'
  | 'confirmDeleteLabel'
>;

export function WorkspaceProjectPanelContextProviders({
  children,
  projects,
  activeProjectId,
  labels,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  confirmDeleteLabel,
}: WorkspaceProjectPanelContextProvidersProps): JSX.Element {
  return (
    <WorkspaceProjectPanelProjectStateProvider projects={projects} activeProjectId={activeProjectId}>
      <WorkspaceProjectPanelLabelStateProvider labels={labels}>
        <WorkspaceProjectPanelActionsContextProvider
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onUpdateProject={onUpdateProject}
          onCreateLabel={onCreateLabel}
          onUpdateLabel={onUpdateLabel}
          onDeleteLabel={onDeleteLabel}
          confirmDeleteLabel={confirmDeleteLabel}
        >
          {children}
        </WorkspaceProjectPanelActionsContextProvider>
      </WorkspaceProjectPanelLabelStateProvider>
    </WorkspaceProjectPanelProjectStateProvider>
  );
}
