import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubReconciliation } from '../modules/workspaceProjectsPanel/components/GithubReconciliation';
import { applyGithubReconciliation, previewGithubReconciliation, type ReconciliationCandidate } from '../services/githubReconciliation';

vi.mock('../services/githubReconciliation', () => ({ previewGithubReconciliation: vi.fn(), applyGithubReconciliation: vi.fn() }));
const candidate = (id: string, overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate => ({
  id, ticketId: id, ticketKey: `GRAV-${id}`, ticketTitle: 'Recover updates',
  pull: { number: Number(id), title: 'Recover updates', url: `https://github.com/owner/repo/pull/${id}`, branch: 'branch', state: 'closed', mergedAt: '2026-01-02T00:00:00Z' },
  evidence: ['Ticket key in PR title'], confidence: 'explicit', conflicts: [], protected: false, requiresReview: false, noChange: false,
  current: { status: 'todo', prStatus: 'none', prUrl: null }, proposed: { status: 'done', prStatus: 'merged', prUrl: `https://github.com/owner/repo/pull/${id}` }, ...overrides,
});
const preview = (candidates: ReconciliationCandidate[]) => ({ previewToken: 'signed', expiresAt: Date.now() + 10000, repository: 'owner/repo', candidates, pullCount: 3, pagesFetched: 1, incomplete: false, nextPage: null });

beforeEach(() => vi.clearAllMocks());
describe('GitHub reconciliation review UI', () => {
  it('shows evidence and protection; requires individual review and applies only selected matches', async () => {
    vi.mocked(previewGithubReconciliation).mockResolvedValue(preview([
      candidate('1'), candidate('2', { requiresReview: true, confidence: 'suggested', conflicts: ['Title similarity requires individual review'] }),
      candidate('3', { protected: true, conflicts: ['Canceled ticket: manual decision preserved'] }),
    ]));
    vi.mocked(applyGithubReconciliation).mockResolvedValue({ results: [{ candidateId: '2', ticketKey: 'GRAV-2', prNumber: 2, outcome: 'applied' }] });
    const user = userEvent.setup();
    render(<GithubReconciliation projectId="project" workspaceId="workspace" />);
    await user.click(screen.getByRole('button', { name: 'Preview GitHub updates' }));
    expect(await screen.findAllByText('Explicit match')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'GRAV-1' })).toHaveAttribute('href', '/workspaces/workspace/projects/project/tickets/GRAV-1');
    expect(screen.queryByRole('checkbox', { name: 'Select GRAV-3 PR #3' })).not.toBeInTheDocument();
    const choice = screen.getByRole('checkbox', { name: 'Select GRAV-2 PR #2' });
    expect(choice).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'I reviewed GRAV-2 with PR #2' }));
    await user.click(choice);
    await user.click(screen.getByRole('button', { name: 'Apply 1 selected match' }));
    expect(applyGithubReconciliation).toHaveBeenCalledWith('project', 'signed', [{ candidateId: '2', reviewed: true }], '');
    expect(await screen.findByText('GRAV-2 / PR #2: applied')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('permits only one selected PR per ticket and clears credentials when changing project', async () => {
    vi.mocked(previewGithubReconciliation).mockResolvedValue(preview([
      candidate('1', { ticketId: 'same' }), candidate('2', { ticketId: 'same' }),
    ]));
    const user = userEvent.setup();
    const { rerender } = render(<GithubReconciliation key="first" projectId="first" />);
    await user.type(screen.getByLabelText('Read-only GitHub token (optional for public repositories)'), 'github_pat_test');
    await user.click(screen.getByRole('button', { name: 'Preview GitHub updates' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Select GRAV-1 PR #1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select GRAV-2 PR #2' }));
    expect(screen.getByRole('checkbox', { name: 'Select GRAV-1 PR #1' })).not.toBeChecked();
    rerender(<GithubReconciliation key="second" projectId="second" />);
    expect(screen.getByLabelText('Read-only GitHub token (optional for public repositories)')).toHaveValue('');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('shows scan errors and does not enable apply', async () => {
    vi.mocked(previewGithubReconciliation).mockRejectedValue(new Error('GitHub rate limited this scan'));
    const user = userEvent.setup();
    render(<GithubReconciliation projectId="project" />);
    await user.click(screen.getByRole('button', { name: 'Preview GitHub updates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub rate limited');
    expect(screen.queryByRole('button', { name: /Apply/ })).not.toBeInTheDocument();
  });
});
