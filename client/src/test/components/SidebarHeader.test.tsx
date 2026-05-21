import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarHeader } from '../../components/Sidebar/components/SidebarHeader.tsx';

vi.mock('@library', () => ({
  ThemeToggle: () => <div>ThemeToggle</div>,
  Select: ({ value, onValueChange, options, ...props }: {
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe('SidebarHeader', () => {
  it('hides the New Ticket button when the workspace has no projects', () => {
    render(
      <SidebarHeader
        workspace={{
          workspaces: [{ id: 'workspace-1', name: 'Gravity' }],
          activeWorkspaceId: 'workspace-1',
          onSelectWorkspace: vi.fn(),
          onOpenWorkspaceDirectory: vi.fn(),
        }}
        canOpenCreateTicket={false}
        onOpenCreateTicket={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'New Ticket' })).not.toBeInTheDocument();
  });
});