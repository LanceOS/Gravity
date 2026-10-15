import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkTicketTriage } from '../../modules/tickets/components/BulkTicketTriage';
import type { Ticket } from '../../types/domain';

const post = vi.fn();
vi.mock('../../utils/apiClient', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
  ApiError: class extends Error { status = 400; },
}));

const ticket = (id: string, projectId: string): Ticket => ({
  id, key: `GRV-${id}`, title: `Ticket ${id}`, description: '', status: 'todo', priority: 'medium',
  assigneeId: null, projectId, cycleId: null, parentId: null, prStatus: 'none', prUrl: null,
  createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
});

describe('BulkTicketTriage', () => {
  it('does not label an uncertain network result as a failed ticket edit', async () => {
    const user = userEvent.setup();
    const selected = ticket('1', 'project-1');
    post.mockRejectedValueOnce(new Error('Connection lost'));
    render(<QueryClientProvider client={new QueryClient()}><BulkTicketTriage
      workspaceId="workspace-1" visibleTickets={[selected]} selectedTickets={[selected]}
      projects={[]} users={[]} labels={[]} onSelectVisible={vi.fn()} onClear={vi.fn()}
    /></QueryClientProvider>);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Bulk action value' }), 'done');
    await user.click(screen.getByRole('button', { name: 'Apply to selected' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh before retrying');
    expect(screen.queryByText(/succeeded; .* failed/)).not.toBeInTheDocument();
  });

  it('previews mixed-project label eligibility and reports each partial result', async () => {
    const user = userEvent.setup();
    const first = ticket('1', 'project-1');
    const second = ticket('2', 'project-2');
    post.mockResolvedValueOnce({ results: [
      { id: first.id, success: true, ticket: first },
      { id: second.id, success: false, error: 'Label is not available for this project or team.' },
    ] });
    render(<QueryClientProvider client={new QueryClient()}><BulkTicketTriage
      workspaceId="workspace-1" isTeamWorkspace visibleTickets={[first, second]} selectedTickets={[first, second]}
      projects={[{ id: 'project-1', name: 'First', description: '', key: 'ONE', status: 'active', teamId: 'team-1' },
        { id: 'project-2', name: 'Second', description: '', key: 'TWO', status: 'active', teamId: 'team-2' }]}
      labels={[{ id: 'label-1', name: 'Ready', color: '#000', teamId: 'team-1' }]}
      users={[]} onSelectVisible={vi.fn()} onClear={vi.fn()}
    /></QueryClientProvider>);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('2 selected');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Bulk action' }), 'add_label');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Bulk action value' }), 'label-1');
    expect(screen.getByText(/1 tickets cannot use this label/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply to selected' }));
    expect(post).toHaveBeenCalledWith('/tickets/bulk-triage', expect.objectContaining({
      workspaceId: 'workspace-1', action: { type: 'add_label', value: 'label-1' },
      tickets: expect.arrayContaining([expect.objectContaining({ id: '1', projectId: 'project-1' })]),
    }));
    expect(await screen.findByText('1 succeeded; 1 failed')).toBeInTheDocument();
    expect(screen.getByText(/GRV-2: Label is not available/)).toBeInTheDocument();
  });
});
