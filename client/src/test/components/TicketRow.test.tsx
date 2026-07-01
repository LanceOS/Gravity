import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketRow } from '../../modules/tickets/components/TicketRow';

describe('TicketRow', () => {
  const ticket = {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Completed desktop ticket row',
    description: '',
    status: 'canceled' as const,
    priority: 'high' as const,
    assigneeId: null,
    projectId: 'p1',
    labelIds: [],
    labels: [],
    cycleId: null,
    parentId: null,
    prStatus: 'none' as const,
    prUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders the status badge and marks completed tickets', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const priorityIcon = <span data-testid="priority-icon">🔥</span>;

    render(
      <TicketRow
        ticket={ticket}
        onClick={onClick}
        priority={ticket.priority}
        priorityIcon={priorityIcon}
        assigneeAvatar={null}
      />
    );

    const statusDot = screen.getByLabelText('Status: CANCELED');
    const title = screen.getByText('Completed desktop ticket row');

    expect(screen.getByTestId('priority-icon')).toBeInTheDocument();
    expect(statusDot).toBeInTheDocument();
    expect(title).toHaveStyle('text-decoration: line-through');
    expect(statusDot.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    await user.click(title);
    expect(onClick).toHaveBeenCalledWith(ticket);
  });
});
