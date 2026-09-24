import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, ReactNode, SelectHTMLAttributes } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketList } from '../../modules/tickets';
import type { TicketRowProps } from '../../modules/tickets/types/TicketList';

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  variant?: string;
  size?: string;
};

type MockTextInputProps = {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  style?: CSSProperties;
};

type MockSelectOption = {
  value: string;
  label: string;
};

type MockSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  options: MockSelectOption[];
  onValueChange: (value: string) => void;
};

vi.mock('@library', async () => ({
  Button: ({ children, ...props }: MockButtonProps) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
    return <button {...buttonProps}>{children}</button>;
  },
  DenseTextInput: ({ value, onChange, ...props }: MockTextInputProps) => <input value={value} onChange={onChange} {...props} />,
  Select: ({ options, onValueChange, ...props }: MockSelectProps) => (
    <select {...props} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  DenseVirtualList: (await vi.importActual<typeof import('../../../../library/components/densevirtuallist/DenseVirtualList')>(
    '../../../../library/components/densevirtuallist/DenseVirtualList'
  )).DenseVirtualList,
}));

vi.mock('../../modules/tickets/components/TicketRow', () => ({
  TicketRow: ({ ticket, onClick, assigneeAvatar }: TicketRowProps) => (
    <button type="button" onClick={() => onClick(ticket)}>{`TicketRow ${ticket.key} ${assigneeAvatar || 'no-avatar'}`}</button>
  ),
}));

vi.mock('../../modules/tickets/components/TicketRowMobile/TicketRowMobile', () => ({
  TicketRowMobile: ({ ticket, onClick, assigneeAvatar }: TicketRowProps) => (
    <button type="button" onClick={() => onClick(ticket)}>{`TicketRowMobile ${ticket.key} ${assigneeAvatar || 'no-avatar'}`}</button>
  ),
}));

vi.mock('../../modules/tickets/components/DenseGridController', () => ({
  DenseGridController: ({ tickets, onSelectTicket }: { tickets: Array<{ key: string }>; onSelectTicket: (ticket: { key: string }) => void }) => (
    <div>
      <div>{`DenseGridController ${tickets.length}`}</div>
      <button type="button" onClick={() => onSelectTicket(tickets[0])}>
        Select first grid ticket
      </button>
    </div>
  ),
}));

const backlogTicket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'Fix sync retries',
  description: 'Investigate retry handling.',
  status: 'backlog' as const,
  priority: 'high' as const,
  assigneeId: 'user-1',
  projectId: 'project-1',
  domainId: 'domain-1',
  cycleId: null,
  parentId: null,
  prStatus: 'none' as const,
  prUrl: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const doneTicket = {
  id: 'ticket-2',
  key: 'GRA-2',
  title: 'Ship toolbar polish',
  description: 'Refine grouped layout.',
  status: 'done' as const,
  priority: 'low' as const,
  assigneeId: null,
  projectId: 'project-1',
  domainId: null,
  cycleId: null,
  parentId: null,
  prStatus: 'none' as const,
  prUrl: null,
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
};

function renderTicketList(overrides: Partial<Parameters<typeof TicketList>[0]> = {}) {
  const props = {
    filteredCount: 2,
    groupedTickets: {
      backlog: [backlogTicket],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [doneTicket],
      canceled: [],
    },
    domainById: {
      'domain-1': {
        id: 'domain-1',
        name: 'Platform',
        color: '#10b981',
      },
    },
    userAvatarById: {
      'user-1': 'avatar-1.png',
    },
    onSelectTicket: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<TicketList {...props} />),
    props,
  };
}

describe('TicketList', () => {
  it('preserves the focused ticket DOM node when the dataset crosses the threshold in either direction', () => {
    const tickets = Array.from({ length: 120 }, (_, index) => ({ ...backlogTicket, id: `ticket-${index}`, key: `GRA-${index}` }));
    const { rerender, props } = renderTicketList({ filteredCount: 120,
      groupedTickets: { backlog: tickets, todo: [], in_progress: [], in_review: [], done: [], canceled: [] } });
    const focused = screen.getByRole('button', { name: 'TicketRow GRA-0 avatar-1.png' });
    act(() => focused.focus());
    rerender(<TicketList {...props} filteredCount={119} groupedTickets={{ ...props.groupedTickets, backlog: tickets.slice(0, 119) }} />);
    expect(screen.getByRole('button', { name: 'TicketRow GRA-0 avatar-1.png' })).toBe(focused);
    expect(focused).toHaveFocus();
    rerender(<TicketList {...props} />);
    expect(screen.getByRole('button', { name: 'TicketRow GRA-0 avatar-1.png' })).toBe(focused);
    expect(focused).toHaveFocus();
  });

  it('clears filters and selects grouped rows', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketList({
      filteredCount: 1,
    });

    expect(screen.getByText('BACKLOG')).toBeInTheDocument();
    expect(screen.getByText('DONE')).toBeInTheDocument();

    expect(screen.getByText('TicketRow GRA-1 avatar-1.png')).toBeInTheDocument();
    expect(screen.queryByText('TicketRowMobile GRA-1 avatar-1.png')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'TicketRow GRA-1 avatar-1.png' }));
    expect(props.onSelectTicket).toHaveBeenCalledWith(backlogTicket);
  });

  it('virtualizes a large single-status list from its first page and preserves row pitch after loading', async () => {
    const user = userEvent.setup();
    const tickets = Array.from({ length: 120 }, (_, index) => ({
      ...backlogTicket,
      id: `ticket-${index + 1}`,
      key: `GRA-${index + 1}`,
    }));

    renderTicketList({
      filteredCount: tickets.length,
      groupedTickets: {
        backlog: tickets,
        todo: [],
        in_progress: [],
        in_review: [],
        done: [],
        canceled: [],
      },
    });

    const grid = screen.getByRole('grid');
    fireEvent.scroll(grid, { target: { scrollTop: 2200 } });
    await user.click(await screen.findByRole('button', { name: 'Load more 70 remaining' }));
    expect(screen.getByRole('button', { name: 'Load more 20 remaining' })).toHaveFocus();
    fireEvent.scroll(grid, { target: { scrollTop: 4700 } });
    await user.click(await screen.findByRole('button', { name: 'Load more 20 remaining' }));
    fireEvent.scroll(grid, { target: { scrollTop: 0 } });

    const firstTicketRow = (await screen.findByText('TicketRow GRA-1 avatar-1.png')).closest('.ticket-list__row-desktop');
    expect(firstTicketRow?.parentElement).toHaveStyle({ height: '50.5px' });
  });

  it('keeps tickets rendered at the current scroll position when loading more within a virtualized status', async () => {
    const user = userEvent.setup();
    const backlogTickets = Array.from({ length: 100 }, (_, index) => ({
      ...backlogTicket,
      id: `backlog-${index + 1}`,
      key: `GRA-${index + 1}`,
    }));
    const doneTickets = Array.from({ length: 50 }, (_, index) => ({
      ...doneTicket,
      id: `done-${index + 1}`,
      key: `DONE-${index + 1}`,
    }));
    const canceledTickets = Array.from({ length: 50 }, (_, index) => ({
      ...doneTicket,
      id: `canceled-${index + 1}`,
      key: `CANCELED-${index + 1}`,
      status: 'canceled' as const,
    }));

    renderTicketList({
      filteredCount: 200,
      groupedTickets: {
        backlog: backlogTickets,
        todo: [],
        in_progress: [],
        in_review: [],
        done: doneTickets,
        canceled: canceledTickets,
      },
    });

    const list = screen.getByRole('grid');
    fireEvent.scroll(list, { target: { scrollTop: 2000 } });

    const loadMore = await screen.findByRole('button', { name: 'Load more 50 remaining' });
    expect(screen.getByText('TicketRow GRA-50 avatar-1.png')).toBeInTheDocument();
    expect(screen.queryByText('TicketRow GRA-51 avatar-1.png')).not.toBeInTheDocument();

    await user.click(loadMore);

    expect(list.scrollTop).toBe(2000);
    expect(screen.getByText('TicketRow GRA-50 avatar-1.png')).toBeInTheDocument();
    expect(screen.getByText('TicketRow GRA-51 avatar-1.png')).toBeInTheDocument();
    expect(screen.queryByText('TicketRow GRA-1 avatar-1.png')).not.toBeInTheDocument();
  });
});
