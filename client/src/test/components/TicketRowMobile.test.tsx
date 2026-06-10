import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketRowMobile } from '../../modules/tickets/components/TicketRowMobile';

describe('TicketRowMobile', () => {
  const mockTicket = {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Test mobile ticket row',
    description: '',
    status: 'todo' as const,
    priority: 'high' as const,
    assigneeId: null,
    projectId: 'p1',
    labelIds: ['d1'],
    labels: [{ id: 'd1', name: 'Platform', color: '#10b981', projectId: 'p1' }],
    cycleId: null,
    parentId: 'parent-1',
    prStatus: 'none' as const,
    prUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders correctly with all props and handles clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const priorityIcon = <span data-testid="priority-icon">🔥</span>;
    const assigneeAvatar = 'avatar-url.png';

    render(
      <TicketRowMobile
        ticket={mockTicket}
        onClick={onClick}
        priorityIcon={priorityIcon}
        assigneeAvatar={assigneeAvatar}
      />
    );

    // Main row
    expect(screen.getByText('Test mobile ticket row')).toBeInTheDocument();
    expect(screen.getByTestId('priority-icon')).toBeInTheDocument();
    
    // Avatar
    const avatar = screen.getByRole('presentation', { hidden: true });
    expect(avatar).toHaveAttribute('src', 'avatar-url.png');

    // Meta row
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Sub-ticket')).toBeInTheDocument();

    // Click
    await user.click(screen.getByText('Test mobile ticket row'));
    expect(onClick).toHaveBeenCalledWith(mockTicket);
  });

  it('renders without assignee, domain, or parentId', () => {
    const ticketWithoutMeta = { ...mockTicket, labelIds: [], labels: [], parentId: null };
    render(
      <TicketRowMobile
        ticket={ticketWithoutMeta}
        onClick={vi.fn()}
        priorityIcon={null as any}
        assigneeAvatar={null as any}
      />
    );

    expect(screen.getByText('Test mobile ticket row')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument(); // Missing avatar placeholder
    expect(screen.queryByText('Platform')).not.toBeInTheDocument();
    expect(screen.queryByText('Sub-ticket')).not.toBeInTheDocument();
  });
});
