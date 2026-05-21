import type { Domain, Project } from '../../../context/TicketContext';

export interface WorkspaceProjectPanelProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  domains: Domain[];
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  domainCreateLoading: boolean;
  domainCreateError: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onCreateDomain: (domain: { projectId: string; name: string; color: string }) => Promise<void>;
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