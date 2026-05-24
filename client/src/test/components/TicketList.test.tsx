import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, ReactNode, SelectHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketList } from '../../components/TicketList/TicketList.tsx';
import type { TicketRowProps } from '../../components/TicketList/types';

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

vi.mock('@library', () => ({
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
}));

vi.mock('../../components/TicketList/components', () => ({
  TicketRow: ({ ticket, onClick, assigneeAvatar }: TicketRowProps) => (
    <button type="button" onClick={onClick}>{`TicketRow ${ticket.key} ${assigneeAvatar || 'no-avatar'}`}</button>
  ),
}));

vi.mock('../../components/performance/DenseGridController', () => ({
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
    filters: {
      search: '',
      priority: '',
      status: '',
      projectId: '',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    },
    filteredCount: 2,
    totalCount: 2,
    groupedTickets: {
      backlog: [backlogTicket],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [doneTicket],
      canceled: [],
    },
    listSort: 'created' as const,
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
    hasActiveFilters: false,
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    onListSortChange: vi.fn(),
    onSelectTicket: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<TicketList {...props} />),
    props,
  };
}

describe('TicketList', () => {
  it('forwards filter and sort updates, clears filters, and selects grouped rows', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketList({
      hasActiveFilters: true,
      filteredCount: 1,
      totalCount: 2,
      filters: {
        search: 'sync',
        priority: 'high',
        status: 'backlog',
        projectId: '',
        domainId: '',
        cycleId: '',
        assigneeId: '',
      },
    });

    expect(screen.getByText('BACKLOG')).toBeInTheDocument();
    expect(screen.getByText('DONE')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('sync'), {
      target: { value: 'ship' },
    });
    expect(props.onFilterChange).toHaveBeenCalled();

    fireEvent.change(screen.getByDisplayValue('high'), {
      target: { value: 'low' },
    });
    expect(props.onFilterChange).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByDisplayValue('backlog'), {
      target: { value: 'done' },
    });
    expect(props.onFilterChange).toHaveBeenCalledTimes(3);

    fireEvent.change(screen.getByDisplayValue('created'), {
      target: { value: 'updated' },
    });
    expect(props.onListSortChange).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(props.onClearFilters).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'TicketRow GRA-1 avatar-1.png' }));
    expect(props.onSelectTicket).toHaveBeenCalledWith(backlogTicket);
  });

});