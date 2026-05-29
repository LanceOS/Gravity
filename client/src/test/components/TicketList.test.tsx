import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TicketList } from '../../../modules/tickets/components/TicketList';
import type { TicketsByStatus } from '../../../modules/tickets/utils/ticketView';

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
    prStatus: 'none',
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
    <button type="button" onClick={() => onClick(ticket)}>{`TicketRow ${ticket.key} ${assigneeAvatar || 'no-avatar'}`}</button>
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