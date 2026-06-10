import type { Label, Project } from '../../../context/TicketContext';

export interface WorkspaceProjectPanelProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  labels: Label[];
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  labelCreateLoading: boolean;
  labelCreateError: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onCreateLabel: (label: { projectId: string; name: string; color: string; description?: string; sortOrder?: number }) => Promise<void>;
  onUpdateLabel: (labelId: string, updates: { name?: string; color?: string; description?: string; sortOrder?: number }) => Promise<void>;
  onDeleteLabel: (labelId: string) => Promise<void>;
}

export interface ProjectSelectionRailProps {
  projects: Project[];
  selectedProjectId: string | null;
  defaultProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

export interface ProjectCreateOverlayProps {
  loading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmitProject: (project: { name: string; description: string; key: string }) => Promise<void>;
}
