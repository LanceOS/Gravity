import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketCard } from '../../modules/tickets/components/TicketCard';

vi.mock('@library', () => ({
  Card: ({ children, bodyStyle: _bodyStyle, ...props }: any) => <div {...props}>{children}</div>,
  Avatar: ({ src, name, ...props }: any) => (
    src ? <img src={src} alt={name || ''} {...props} /> : <div {...props}>avatar</div>
  ),
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  Flex: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

describe('TicketCard', () => {
  const ticket = {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Completed board ticket',
    description: '',
    status: 'done' as const,
    priority: 'medium' as const,
    assigneeId: 'user-1',
    projectId: 'p1',
    labelIds: [],
    labels: [],
    cycleId: null,
    parentId: 'parent-1',
    prStatus: 'open' as const,
    prUrl: 'https://example.com/pr/1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders a visible status badge and completed styling', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onDragStart = vi.fn();

    render(
      <TicketCard
        ticket={ticket}
        onClick={onClick}
        onDragStart={onDragStart}
        priority={ticket.priority}
        priorityIcon={<span data-testid="priority-icon">⬆</span>}
        priorityColor="#f59e0b"
        assigneeAvatar="avatar.png"
      />
    );

    const statusDot = screen.getByLabelText('Status: DONE');
    const title = screen.getByText('Completed board ticket');

    expect(statusDot).toBeInTheDocument();
    expect(title).toHaveStyle('text-decoration: line-through');
    expect(statusDot.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    await user.click(title);
    expect(onClick).toHaveBeenCalled();

    fireEvent.dragStart(title.closest('[draggable="true"]') as Element);
    expect(onDragStart).toHaveBeenCalled();
  });
});
