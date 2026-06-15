import { useMemo } from 'react';
import type { Cycle, Label, Ticket } from '../../../types/domain';

interface UseWorkspaceSidebarCountsArgs {
  tickets: Ticket[];
  labels: Label[];
  cycles: Cycle[];
  currentUserId?: string;
}

interface UseWorkspaceSidebarCountsResult {
  openTickets: Ticket[];
  myIssuesCount: number;
  labelCounts: Record<string, number>;
  cycleCounts: Record<string, number>;
}

export function useWorkspaceSidebarCounts({
  tickets,
  labels,
  cycles,
  currentUserId,
}: UseWorkspaceSidebarCountsArgs): UseWorkspaceSidebarCountsResult {
  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'done' && ticket.status !== 'canceled'),
    [tickets]
  );

  const myIssuesCount = useMemo(
    () => openTickets.filter((ticket) => ticket.assigneeId === currentUserId).length,
    [currentUserId, openTickets]
  );

  const labelCounts = useMemo(
    () =>
      Object.fromEntries(
        labels.map((label) => [label.id, openTickets.filter((ticket) => ticket.labelIds?.includes(label.id)).length])
      ),
    [labels, openTickets]
  );

  const cycleCounts = useMemo(
    () =>
      Object.fromEntries(
        cycles.map((cycle) => [cycle.id, openTickets.filter((ticket) => ticket.cycleId === cycle.id).length])
      ),
    [cycles, openTickets]
  );

  return { openTickets, myIssuesCount, labelCounts, cycleCounts };
}
