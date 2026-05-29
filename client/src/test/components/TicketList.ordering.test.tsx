import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TicketList } from '../../modules/tickets/components/TicketList';
import type { TicketsByStatus } from '../../modules/tickets/utils/ticketView';

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: overrides.id || 'ticket-1',
    key: overrides.key || 'GRA-1',
    title: overrides.title || 'A ticket',
    description: overrides.description || '',
    status: (overrides.status as any) || 'backlog',
    priority: overrides.priority || 'no_priority',
    projectId: overrides.projectId || '',
    domainId: overrides.domainId ?? null,
    cycleId: overrides.cycleId ?? null,
    assigneeId: overrides.assigneeId ?? null,
    parentId: overrides.parentId ?? null,
    prStatus: 'none' as const,
    prUrl: null,
    createdAt: overrides.createdAt || '2026-05-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-01T00:00:00.000Z',
  };
}

describe('TicketList ordering', () => {
  it('renders statuses in the configured LIST_STATUS_ORDER', () => {
    const groupedTickets: TicketsByStatus = {
      backlog: [makeTicket({ id: 'b', title: 'Backlog', status: 'backlog' })],
      todo: [makeTicket({ id: 't', title: 'Todo', status: 'todo' })],
      in_progress: [makeTicket({ id: 'p', title: 'In Progress', status: 'in_progress' })],
      in_review: [makeTicket({ id: 'r', title: 'In Review', status: 'in_review' })],
      done: [makeTicket({ id: 'd', title: 'Done', status: 'done' })],
      canceled: [],
    };

    render(
      <TicketList
        filteredCount={6}
        groupedTickets={groupedTickets}
        domainById={{}}
        userAvatarById={{}}
        onSelectTicket={() => {}}
      />
    );

    const order = ['IN REVIEW', 'IN PROGRESS', 'TODO', 'BACKLOG', 'DONE'];
    const elems = order.map((label) => screen.getByText(label));

    function isBefore(a: Element, b: Element) {
      return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    for (let i = 0; i < elems.length - 1; i++) {
      expect(isBefore(elems[i], elems[i + 1])).toBe(true);
    }
  });
});
