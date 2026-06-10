import type { Cycle, Label, Project, Ticket, User } from '../../../context/TicketContext';

export interface CreateTicketInput {
  title: string;
  description: string;
  status: Ticket['status'];
  priority: Ticket['priority'];
  projectId: string;
  labelIds: string[];
  cycleId: string | null;
  assigneeId: string | null;
  parentId: string | null;
}

export interface CreateTicketModalProps {
  onClose: () => void;
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  users: User[];
  parentTicket: Ticket | null;
  defaultProjectId: string;
  onSubmitTicket: (ticket: CreateTicketInput) => Promise<boolean>;
  initialStatus?: Ticket['status'];
  parentId?: string;
}