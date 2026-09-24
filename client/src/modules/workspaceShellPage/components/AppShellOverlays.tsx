import type { ReactNode } from 'react';
import type { Cycle, Label, Project, Ticket, User } from '../../../types/domain';
import { CreateTicketModal, LabelCreateOverlay } from '../../../modules/tickets';
import { ProjectCreateOverlay } from '../../../components/WorkspaceProjectPanel';

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
  createProject: CreateProjectOverlayProps;
  createLabel: CreateLabelOverlayProps;
}

export function AppShellOverlays({
  onboarding,
  createTicket,
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
