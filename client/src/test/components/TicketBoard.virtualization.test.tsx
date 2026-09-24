import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '../../context/TicketContextContext';
import { TicketBoard } from '../../modules/tickets/components/TicketBoard';

vi.mock('../../modules/tickets/components/TicketContextMenu', () => ({
  TicketContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../utils/animationUtils', () => ({
  safeAnime: vi.fn(),
  prefersReducedMotion: () => true,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TicketBoard virtualization', () => {
  it('keeps room for card content and the stack gap after loading more than 50 cards', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });

    const tickets: Ticket[] = Array.from({ length: 60 }, (_, index) => ({
      id: `ticket-${index}`,
      key: `GRA-${index}`,
      title: index % 2 ? 'A long ticket title that wraps across two lines '.repeat(5) : 'Update workspace navigation',
      description: '',
      status: 'todo',
      priority: 'high',
      projectId: 'project-1',
      assigneeId: index % 2 ? 'member-1' : null,
      labelIds: [],
      labels: [],
      cycleId: null,
      parentId: null,
      prStatus: index % 2 ? 'open' : 'none',
      prUrl: null,
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
    }));

    const { container } = render(
      <TicketBoard
        ticketsByColumn={{ backlog: [], todo: tickets, in_progress: [], in_review: [], done: [], canceled: [] }}
        userAvatarById={{}}
        onMoveTicket={vi.fn().mockResolvedValue(undefined)}
        onSelectTicket={vi.fn()}
        onOpenCreateTicket={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.ticket-card')).toHaveLength(40);
    const cardHeight = Number.parseFloat(getComputedStyle(container.querySelector('.ticket-card')!).height);
    expect(cardHeight).toBeGreaterThanOrEqual(153); // Two title lines plus a PR badge need roughly 153px.

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));

    const grid = screen.getByRole('grid');
    expect(grid).toHaveAttribute('aria-rowcount', '60');
    const cards = grid.querySelectorAll<HTMLElement>('.ticket-card');
    expect(cards.length).toBeLessThan(60);

    const firstRow = cards[0].closest<HTMLElement>('[style*="translate3d"]')!;
    const secondRow = cards[1].closest<HTMLElement>('[style*="translate3d"]')!;
    const expectedPitch = cardHeight + 8;

    expect(firstRow).toHaveStyle({ height: `${expectedPitch}px` });
    expect(secondRow).toHaveStyle({ transform: `translate3d(0, ${expectedPitch}px, 0)` });
    expect(cards[1]).toHaveStyle({ height: `${cardHeight}px` });
    expect(grid.firstElementChild).toHaveStyle({ height: `${60 * expectedPitch}px` });
  });
});
