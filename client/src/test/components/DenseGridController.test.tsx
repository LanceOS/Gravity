import type { CSSProperties, ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DenseGridController } from '../../components/performance/DenseGridController.tsx';

type MockInputProps = InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

type MockVirtualListProps<T> = {
  items: T[];
  renderRow: (item: T, index: number, style: CSSProperties) => ReactNode;
};

vi.mock('@library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../library')>();

  return {
    ...actual,
    DenseTextInput: ({ value, onChange, ...props }: MockInputProps) => (
      <input value={value} onChange={onChange} {...props} />
    ),
    DenseVirtualList: <T,>({ items, renderRow }: MockVirtualListProps<T>) => (
      <div data-testid="dense-virtual-list">
        {items.map((item, index) => renderRow(item, index, { height: '28px' }))}
      </div>
    ),
  };
});

const tickets = [
  {
    id: 'ticket-1',
    key: 'GRA-101',
    title: 'Setup auth gateway',
    description: 'Implement token validation on the API edge.',
    status: 'todo' as const,
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
  },
  {
    id: 'ticket-2',
    key: 'GRA-102',
    title: 'Ship billing export',
    description: 'Generate export bundles for invoices.',
    status: 'in_review' as const,
    priority: 'medium' as const,
    assigneeId: null,
    projectId: 'project-1',
    domainId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'open' as const,
    prUrl: 'https://example.com/pr/1',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'ticket-3',
    key: 'GRA-103',
    title: 'Tune search indexing',
    description: 'Improve search result ordering for support tickets.',
    status: 'done' as const,
    priority: 'low' as const,
    assigneeId: 'user-2',
    projectId: 'project-1',
    domainId: 'domain-2',
    cycleId: null,
    parentId: null,
    prStatus: 'merged' as const,
    prUrl: 'https://example.com/pr/2',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
];

const userAvatarById = {
  'user-1': 'https://example.com/casey.png',
};

const domainById = {
  'domain-1': {
    id: 'domain-1',
    name: 'Backend',
    color: '#10b981',
  },
  'domain-2': {
    id: 'domain-2',
    name: 'Search',
    color: '#3b82f6',
  },
};

function renderDenseGridController(overrides: Partial<Parameters<typeof DenseGridController>[0]> = {}) {
  const props = {
    tickets,
    onSelectTicket: vi.fn(),
    userAvatarById,
    domainById,
    ...overrides,
  };

  return {
    ...render(<DenseGridController {...props} />),
    props,
  };
}

describe('DenseGridController', () => {
  it('filters rows by the deferred search term and shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderDenseGridController();

    expect(screen.getByText('3 of 3 virtual rows')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();

    const filterInput = screen.getByLabelText('Filter database records');
    await user.type(filterInput, 'billing');

    await waitFor(() => {
      expect(screen.getByText('1 of 3 virtual rows')).toBeInTheDocument();
    });

    expect(screen.getByText('Ship billing export')).toBeInTheDocument();
    expect(screen.queryByText('Setup auth gateway')).not.toBeInTheDocument();

    await user.clear(filterInput);
    await user.type(filterInput, 'missing');

    await waitFor(() => {
      expect(screen.getByText('No tickets match your filter criteria.')).toBeInTheDocument();
    });
  });

  it('selects rows with mouse and keyboard interactions', async () => {
    const user = userEvent.setup();
    const { props } = renderDenseGridController();

    const rows = screen.getAllByRole('row');
    await user.click(rows[0]);
    expect(props.onSelectTicket).toHaveBeenCalledWith(tickets[0]);

    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(props.onSelectTicket).toHaveBeenCalledWith(tickets[1]);

    fireEvent.keyDown(rows[1], { key: ' ' });
    expect(props.onSelectTicket).toHaveBeenCalledTimes(3);
  });
});