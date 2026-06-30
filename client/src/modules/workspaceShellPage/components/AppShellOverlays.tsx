import type { ReactNode } from 'react';
import type { Cycle, Label, Project, Ticket, User } from '../../../types/domain';
import { CreateTicketModal, LabelCreateOverlay } from '../../../modules/tickets';
import { ProjectCreateOverlay } from '../../../components/WorkspaceProjectPanel';
import { WorkspaceMcpModal } from '../../../modules/workspaces';

type CreateTicketOverlayProps = {
  isOpen: boolean;
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  users: User[];
  parentTicket: Ticket | null;
  defaultProjectId: string;
  initialStatus?: Ticket['status'];
  parentId?: string;
  onClose: () => void;
  onSubmitTicket: (ticket: {
    title: string;
    description: string;
    status: Ticket['status'];
    priority: Ticket['priority'];
    projectId: string;
    labelIds?: string[];
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }) => Promise<boolean>;
};

type WorkspaceMcpOverlayProps = {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
};

type CreateProjectOverlayProps = {
  isOpen: boolean;
  loading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmitProject: (project: { name: string; description: string; key: string }) => Promise<void>;
};

type CreateLabelOverlayProps = {
  isOpen: boolean;
  loading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmitLabel: (label: { name: string; color: string; description?: string; sortOrder?: number }) => Promise<void>;
};

interface AppShellOverlaysProps {
  onboarding: ReactNode;
  createTicket?: CreateTicketOverlayProps;
  mcp: WorkspaceMcpOverlayProps;
  createProject: CreateProjectOverlayProps;
  createLabel: CreateLabelOverlayProps;
}

export function AppShellOverlays({
  onboarding,
  createTicket,
  mcp,
  createProject,
  createLabel,
}: AppShellOverlaysProps) {
  return (
    <>
      <CreateTicketModal
        isOpen={!!createTicket?.isOpen}
        onClose={createTicket?.onClose || (() => {})}
        projects={createTicket?.projects || []}
        labels={createTicket?.labels || []}
        cycles={createTicket?.cycles || []}
        users={createTicket?.users || []}
        parentTicket={createTicket?.parentTicket || null}
        defaultProjectId={createTicket?.defaultProjectId || ''}
        onSubmitTicket={createTicket?.onSubmitTicket || (async () => false)}
        initialStatus={createTicket?.initialStatus}
        parentId={createTicket?.parentId}
      />

      {onboarding}

      <WorkspaceMcpModal workspaceId={mcp.workspaceId} isOpen={mcp.isOpen} onClose={mcp.onClose} />

      <ProjectCreateOverlay
        isOpen={createProject.isOpen}
        loading={createProject.loading}
        errorMessage={createProject.errorMessage}
        onClose={createProject.onClose}
        onSubmitProject={createProject.onSubmitProject}
      />

      <LabelCreateOverlay
        isOpen={createLabel.isOpen}
        loading={createLabel.loading}
        errorMessage={createLabel.errorMessage}
        onClose={createLabel.onClose}
        onSubmitLabel={createLabel.onSubmitLabel}
      />
    </>
  );
}
