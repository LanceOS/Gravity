import { type JSX, type ReactNode } from 'react';

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
  confirmDeleteLabel?: (message: string) => boolean | Promise<boolean>;
} & Pick<
  WorkspaceProjectPanelProps,
  | 'onSelectProject'
    | 'onCreateProject'
    | 'onUpdateProject'
    | 'onCreateLabel'
    | 'onUpdateLabel'
    | 'onDeleteLabel'
    | 'onDeleteProject'
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
  onDeleteProject,
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
          onDeleteProject={onDeleteProject}
          confirmDeleteLabel={confirmDeleteLabel}
        >
          {children}
        </WorkspaceProjectPanelActionsContextProvider>
      </WorkspaceProjectPanelLabelStateProvider>
    </WorkspaceProjectPanelProjectStateProvider>
  );
}
