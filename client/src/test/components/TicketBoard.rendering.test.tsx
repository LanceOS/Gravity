import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '../../types/domain';
import type { TicketBoardProps, TicketCardProps } from '../../modules/tickets/types/TicketBoard';
import { TicketBoard } from '../../modules/tickets/components/TicketBoard';

const { renderCard } = vi.hoisted(() => ({ renderCard: vi.fn() }));

vi.mock('../../modules/tickets/components/TicketContextMenu', () => ({
  TicketContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../modules/tickets/components/TicketCard', async () => {
  const { memo } = await import('react');
  return {
    TicketCard: memo(({ ticket, onClick, assigneeAvatar }: TicketCardProps) => {
      renderCard(ticket.id);
      return (
        <button type="button" onClick={onClick}>
          {ticket.title}
          {assigneeAvatar ? <img src={assigneeAvatar} alt={`${ticket.key} assignee`} /> : null}
        </button>
      );
    }),
  };
});

vi.mock('../../utils/animationUtils', () => ({
  safeAnime: vi.fn(),
  prefersReducedMotion: () => true,
}));

const firstTicket: Ticket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'First ticket',
  description: '',
  status: 'todo',
  priority: 'high',
  projectId: 'project-1',
  assigneeId: 'user-1',
  labelIds: [],
  labels: [],
  cycleId: null,
  parentId: null,
  prStatus: 'none',
  prUrl: null,
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};
const secondTicket: Ticket = { ...firstTicket, id: 'ticket-2', key: 'GRA-2', title: 'Second ticket' };

function createProps(): TicketBoardProps {
  return {
    ticketsByColumn: {
      backlog: [],
      todo: [firstTicket, secondTicket],
      in_progress: [],
      in_review: [],
      done: [],
      canceled: [],
    },
    userAvatarById: { 'user-1': '/old-avatar.png' },
    onMoveTicket: vi.fn().mockResolvedValue(undefined),
    onSelectTicket: vi.fn(),
    onOpenCreateTicket: vi.fn(),
  };
}

beforeEach(() => {
  renderCard.mockClear();
});

describe('TicketBoard rendering', () => {
  it('keeps unchanged cards memoized when another ticket changes', () => {
    const props = createProps();
    const { rerender } = render(<TicketBoard {...props} />);
    renderCard.mockClear();

    rerender(
      <TicketBoard
        {...props}
        ticketsByColumn={{
          ...props.ticketsByColumn,
          todo: [firstTicket, { ...secondTicket, title: 'Updated ticket', updatedAt: '2026-09-24T01:00:00.000Z' }],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /Updated ticket/ })).toBeInTheDocument();
    expect(renderCard.mock.calls.map(([id]) => id)).toEqual(['ticket-2']);
  });

  it('updates avatars without requiring a ticket timestamp change', () => {
    const props = createProps();
    const { rerender } = render(<TicketBoard {...props} />);

    rerender(<TicketBoard {...props} userAvatarById={{ 'user-1': '/new-avatar.png' }} />);

    expect(screen.getByRole('img', { name: 'GRA-1 assignee' })).toHaveAttribute('src', '/new-avatar.png');
  });

  it('uses the latest selection callback after an unchanged-ticket refresh', () => {
    const props = createProps();
    const { rerender } = render(<TicketBoard {...props} />);

    // Refreshing the grouping must preserve card handlers without pinning the
    // selection callback when navigation subsequently changes.
    rerender(<TicketBoard {...props} ticketsByColumn={{ ...props.ticketsByColumn }} />);
    const nextOnSelectTicket = vi.fn();
    rerender(<TicketBoard {...props} onSelectTicket={nextOnSelectTicket} />);
    fireEvent.click(screen.getByRole('button', { name: /First ticket/ }));

    expect(nextOnSelectTicket).toHaveBeenCalledWith(firstTicket);
    expect(props.onSelectTicket).not.toHaveBeenCalled();
  });
});
