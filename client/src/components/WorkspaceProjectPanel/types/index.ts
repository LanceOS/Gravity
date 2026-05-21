import type { Project } from '../../../context/TicketContext';

export interface WorkspaceProjectPanelProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  projectManageLoading: boolean;
  projectManageError: string | null;
  defaultProjectLoading: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onUpdateProject: (projectId: string, updates: { name: string; description: string; status: Project['status'] }) => Promise<void>;
  onSetDefaultProject: (projectId: string) => Promise<void>;
}