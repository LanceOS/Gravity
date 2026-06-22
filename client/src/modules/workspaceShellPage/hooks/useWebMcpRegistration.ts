import { useEffect } from 'react';
import type { Project, Ticket, User } from '../../../types/domain';
import { registerWebMCPTools } from '../../../utils/webmcp';

interface UseWebMcpRegistrationArgs {
  enabled?: boolean;
  tickets: Ticket[];
  users: User[];
  projects: Project[];
  createTicket: Parameters<typeof registerWebMCPTools>[0]['createTicket'];
  updateTicket: Parameters<typeof registerWebMCPTools>[0]['updateTicket'];
  addComment: Parameters<typeof registerWebMCPTools>[0]['addComment'];
  addTicketBlocker: Parameters<typeof registerWebMCPTools>[0]['addBlocker'];
  removeTicketBlocker: Parameters<typeof registerWebMCPTools>[0]['removeBlocker'];
}

export function supportsWebMcpRegistration() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const modelContext = (navigator as any).modelContext;
  return !!modelContext && typeof modelContext.registerTool === 'function';
}

export function useWebMcpRegistration({
  enabled = true,
  tickets,
  users,
  projects,
  createTicket,
  updateTicket,
  addComment,
  addTicketBlocker,
  removeTicketBlocker,
}: UseWebMcpRegistrationArgs) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = registerWebMCPTools({
      createTicket,
      updateTicket,
      addComment,
      addBlocker: addTicketBlocker,
      removeBlocker: removeTicketBlocker,
      getTickets: () => tickets,
      getUsers: () => users,
      getProjects: () => projects,
    });

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [enabled, tickets, users, projects, createTicket, updateTicket, addComment, addTicketBlocker, removeTicketBlocker]);
}
