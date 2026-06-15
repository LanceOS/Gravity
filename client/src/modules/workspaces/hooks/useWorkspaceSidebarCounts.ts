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
  const counts = useMemo(() => {
    const openTickets: Ticket[] = [];
    const labelCounts: Record<string, number> = Object.fromEntries(labels.map((label) => [label.id, 0]));
    const cycleCounts: Record<string, number> = Object.fromEntries(cycles.map((cycle) => [cycle.id, 0]));
    let myIssuesCount = 0;

    for (const ticket of tickets) {
      if (ticket.status === 'done' || ticket.status === 'canceled') {
        continue;
      }

      openTickets.push(ticket);
      if (ticket.assigneeId === currentUserId) {
        myIssuesCount += 1;
      }

      if (ticket.cycleId) {
        cycleCounts[ticket.cycleId] = (cycleCounts[ticket.cycleId] ?? 0) + 1;
      }

      if (ticket.labelIds?.length) {
        for (const labelId of ticket.labelIds) {
          if (labelCounts[labelId] !== undefined) {
            labelCounts[labelId] += 1;
          }
        }
      }
    }

    return { openTickets, myIssuesCount, labelCounts, cycleCounts };
  }, [tickets, labels, cycles, currentUserId]);

  return counts;
}
