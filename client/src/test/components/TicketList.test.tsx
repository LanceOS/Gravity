import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, ReactNode, SelectHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('../../modules/tickets/components/TicketRow', () => ({
  TicketRow: ({ ticket, onClick, assigneeAvatar }: TicketRowProps) => (
    <button type="button" onClick={onClick}>{`TicketRow ${ticket.key} ${assigneeAvatar || 'no-avatar'}`}</button>
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
  it('clears filters and selects grouped rows', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketList({
      filteredCount: 1,
    });

    expect(screen.getByText('BACKLOG')).toBeInTheDocument();
    expect(screen.getByText('DONE')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'TicketRow GRA-1 avatar-1.png' }));
    expect(props.onSelectTicket).toHaveBeenCalledWith(backlogTicket);
  });
});