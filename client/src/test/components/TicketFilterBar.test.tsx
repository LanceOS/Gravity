import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketFilterBar } from '../../modules/tickets/components/TicketFilterBar/TicketFilterBar';

vi.mock('@library', () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Select: ({ options, onValueChange, value, 'aria-label': ariaLabel }: any) => (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onValueChange(e.target.value)}>
      {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  ),
  DenseTextInput: ({ value, onChange, placeholder }: any) => (
    <input placeholder={placeholder} value={value} onChange={onChange} />
  ),
  Popover: ({ trigger, children }: any) => (
    <div data-testid="popover">
      <div data-testid="popover-trigger">{trigger}</div>
      <div data-testid="popover-content">{children}</div>
    </div>
  ),
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

describe('TicketFilterBar', () => {
  it('renders correctly and shows completed count', () => {
    const props = {
      filters: {
        projectId: 'p1',
        search: '',
        priority: '',
        status: '',
        domainId: '',
        cycleId: '',
        assigneeId: '',
      },
      hasActiveFilters: false,
      onFilterChange: vi.fn(),
      onClearFilters: vi.fn(),
      filteredCount: 5,
      totalCount: 10,
      completedCount: 3,
      listSort: 'created' as const,
      onListSortChange: vi.fn(),
      domains: [],
    };

    render(<TicketFilterBar {...props} />);

    expect(screen.getByText('5 of 10 tickets')).toBeInTheDocument();
    // Badge shouldn't be rendered if there are no active filters
    expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
  });

  it('renders filters inside popover', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const props = {
      filters: {
        projectId: 'p1',
        search: 'bug',
        priority: 'high',
        status: '',
        domainId: '',
        cycleId: '',
        assigneeId: '',
      },
      hasActiveFilters: true,
      onFilterChange,
      onClearFilters: vi.fn(),
      filteredCount: 1,
      totalCount: 10,
      completedCount: 3,
      listSort: 'created' as const,
      onListSortChange: vi.fn(),
      domains: [],
    };

    render(<TicketFilterBar {...props} />);

    // Search is not counted as a popover filter, but priority is. So activeCount = 1
    expect(screen.getByTestId('badge')).toHaveTextContent('1');

    // Select Priority change
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter list by priority' }), 'low');
    expect(onFilterChange).toHaveBeenCalledWith({ priority: 'low' });
  });
});
