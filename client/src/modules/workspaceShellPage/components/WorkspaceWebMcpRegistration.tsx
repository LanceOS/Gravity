import { useCommentContext } from '../../../context/comment/CommentContext';
import { useTicketRelationsContext } from '../../../context/relation/TicketRelationsContext';
import { useTicketMutations } from '../../../context/ticket/TicketMutationContext';
import type { Project, Ticket, User } from '../../../types/domain';
import { useWebMcpRegistration } from '../hooks/useWebMcpRegistration';

interface WorkspaceWebMcpRegistrationProps {
  tickets: Ticket[];
  users: User[];
  projects: Project[];
}

export function WorkspaceWebMcpRegistration({
  tickets,
  users,
  projects,
}: WorkspaceWebMcpRegistrationProps) {
  const { createTicket, updateTicket } = useTicketMutations();
  const { addComment } = useCommentContext();
  const {
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationsContext();

  useWebMcpRegistration({
    tickets,
    users,
    projects,
    createTicket,
    updateTicket,
    addComment,
    addTicketBlocker,
    removeTicketBlocker,
  });

  return null;
}
