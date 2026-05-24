import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, DragEvent, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketBoard } from '../../components/TicketBoard/TicketBoard.tsx';
import type { TicketCardProps } from '../../components/TicketBoard/types';

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

type SelectOption = {
  value: string;
  label: string;
};

type MockSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  'aria-label': string;
  style?: CSSProperties;
};

vi.mock('@library', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: MockButtonProps) => <button {...props}>{children}</button>,
  DenseTextInput: ({ value, onChange, ...props }: MockTextInputProps) => <input value={value} onChange={onChange} {...props} />,
  Select: ({ value, onValueChange, options, 'aria-label': ariaLabel, ...props }: MockSelectProps) => (
    <select aria-label={ariaLabel} value={value} onChange={(event) => onValueChange(event.target.value)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Flex: ({ children, style, ...props }: any) => <div style={{ display: 'flex', ...style }} {...props}>{children}</div>,
  KanbanBoard: ({ columns, cards, onCardMove, renderColumnHeader, style }: any) => (
    <div style={{ display: 'flex', ...style }}>
      {columns.map((col: any) => {
        const colCards = cards.filter((c: any) => c.status === col.id);
        return (
          <div
            key={col.id}
            className="board-column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const cardId = e.dataTransfer.getData('text/plain');
              if (cardId && onCardMove) {
                onCardMove(cardId, col.id);
              }
            }}
          >
            {renderColumnHeader ? renderColumnHeader(col.id, col.title, colCards.length) : <div>{col.title}</div>}
            <div>
              {colCards.map((card: any) => (
                <div key={card.id}>
                  {card.content}
                </div>
              ))}
              {colCards.length === 0 && <div>No tickets</div>}
            </div>
          </div>
        );
      })}
    </div>
  ),
}));

vi.mock('../../components/TicketBoard/components', () => ({
  TicketCard: ({ ticket, onClick, onDragStart, domainName, assigneeAvatar }: TicketCardProps) => (
    <button type="button" draggable onClick={onClick} onDragStart={onDragStart}>
      {`Card ${ticket.key} ${domainName || 'No domain'} ${assigneeAvatar || 'No avatar'}`}
    </button>
  ),
}));

const backlogTicket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'Fix sync errors',
  description: 'Investigate the event sync retries.',
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

const todoTicket = {
  id: 'ticket-2',
  key: 'GRA-2',
  title: 'Ship toolbar polish',
  description: 'Tighten spacing around actions.',
  status: 'todo' as const,
  priority: 'medium' as const,
  assigneeId: null,
  projectId: 'project-2',
  domainId: null,
  cycleId: null,
  parentId: null,
  prStatus: 'none' as const,
  prUrl: null,
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
};

function renderTicketBoard(overrides: Partial<Parameters<typeof TicketBoard>[0]> = {}) {
  const props = {
    projects: [
      {
        id: 'project-1',
        name: 'Gravity Core',
        description: 'Primary workspace',
        key: 'GRA',
        status: 'active' as const,
        workspaceId: 'workspace-1',
      },
      {
        id: 'project-2',
        name: 'Orbit Delivery',
        description: 'Partner workspace',
        key: 'ORB',
        status: 'planned' as const,
        workspaceId: 'workspace-1',
      },
    ],
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
    ticketsByColumn: {
      backlog: [backlogTicket],
      todo: [todoTicket],
      in_progress: [],
      in_review: [],
      done: [],
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
    hasActiveFilters: false,
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    onMoveTicket: vi.fn().mockResolvedValue(undefined),
    onSelectTicket: vi.fn(),
    onOpenCreateTicket: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<TicketBoard {...props} />),
    props,
  };
}

describe('TicketBoard', () => {
  it('forwards filter changes, shows counts, and opens the create flow for a column', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketBoard({
      hasActiveFilters: true,
      filteredCount: 1,
      totalCount: 2,
      filters: {
        search: 'sync',
        priority: 'high',
        status: '',
        projectId: 'project-1',
        domainId: '',
        cycleId: '',
        assigneeId: '',
      },
    });

    expect(screen.getByText('1 of 2 tickets')).toBeInTheDocument();

    const searchInput = screen.getByRole('textbox');
    await user.clear(searchInput);
    await user.type(searchInput, 'sync issue');
    expect(props.onFilterChange).toHaveBeenCalledWith('search', 's');
    expect(props.onFilterChange).toHaveBeenCalledWith('search', 'sync issue');

    fireEvent.change(screen.getByRole('combobox', { name: 'Priority' }), {
      target: { value: 'medium' },
    });
    expect(props.onFilterChange).toHaveBeenCalledWith('priority', 'medium');

    fireEvent.change(screen.getByRole('combobox', { name: 'Project' }), {
      target: { value: 'project-2' },
    });
    expect(props.onFilterChange).toHaveBeenCalledWith('projectId', 'project-2');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Create ticket in Done' }));
    expect(props.onOpenCreateTicket).toHaveBeenCalledWith('done');
  });

  it('selects cards and moves dragged tickets into a new column', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketBoard();
    const ticketCard = screen.getByRole('button', { name: 'Card GRA-1 Platform avatar-1.png' });

    await user.click(ticketCard);
    expect(props.onSelectTicket).toHaveBeenCalledWith(backlogTicket);

    const dataTransfer = {
      data: new Map<string, string>(),
      setData(type: string, value: string) {
        this.data.set(type, value);
      },
      getData(type: string) {
        return this.data.get(type) ?? '';
      },
    };

    fireEvent.dragStart(ticketCard, { dataTransfer });

    const doneColumn = screen.getByText('Done').closest('.board-column');
    expect(doneColumn).not.toBeNull();
    fireEvent.drop(doneColumn as Element, { dataTransfer });

    expect(props.onMoveTicket).toHaveBeenCalledWith('ticket-1', { status: 'done' });
    expect(screen.getAllByText('No tickets').length).toBeGreaterThan(0);
  });
});