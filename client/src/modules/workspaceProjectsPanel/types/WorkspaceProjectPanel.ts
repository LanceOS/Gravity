import type { Label, Project } from '../../../context/TicketContextContext';

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
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<Project | null | undefined>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onCreateLabel: (label: {
    projectId: string;
    name: string;
    color: string;
    description?: string;
    sortOrder?: number;
  }) => Promise<void>;
  onUpdateLabel: (
    labelId: string,
    updates: { name?: string; color?: string; description?: string; sortOrder?: number }
  ) => Promise<void>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  confirmDeleteLabel?: (message: string) => boolean | Promise<boolean>;
}

export interface WorkspaceProjectsPageProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  labels: Label[];
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  labelCreateLoading: boolean;
  labelCreateError: string | null;
  onBackToWorkspace: () => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<Project | null | undefined>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onCreateLabel: (label: {
    projectId: string;
    name: string;
    color: string;
    description?: string;
    sortOrder?: number;
  }) => Promise<void>;
  onUpdateLabel: (
    labelId: string,
    updates: { name?: string; color?: string; description?: string; sortOrder?: number }
  ) => Promise<void>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  onSelectProject: (projectId: string) => void;
}

export interface ProjectSelectionRailProps {
  projects: Project[];
  selectedProjectId: string | null;
  defaultProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

export interface ProjectCreateOverlayProps {
  isOpen: boolean;
  loading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmitProject: (project: { name: string; description: string; key: string }) => Promise<void>;
}

export type ProjectSettingsFeedback = {
  type: 'success' | 'error';
  message: string;
} | null;
