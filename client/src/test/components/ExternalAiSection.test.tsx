import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalAiSection } from '../../modules/accountPreferencesPage/components/sections/ExternalAiSection';
import { ApiError } from '../../utils/apiClient';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../utils/apiClient', async importOriginal => ({
  ...await importOriginal<typeof import('../../utils/apiClient')>(),
  apiClient: mocks,
}));
vi.mock('../../modules/workspaces/components/WorkspaceMcpModal', () => ({
  WorkspaceMcpModal: ({ isOpen, workspaceId, workspaceName, showConnections, onClose, onConnectionsChanged }: any) => isOpen ? (
    <div role="dialog" aria-label={`Connect ${workspaceName}`}>
      <span>{workspaceId}</span>
      <span>{showConnections ? 'Duplicate inventory' : 'Generate only'}</span>
      <button onClick={() => onConnectionsChanged()}>Simulate generation</button>
      <button onClick={onClose}>Close connection</button>
    </div>
  ) : null,
}));

const currentUser = { id: 'user-1', name: 'Casey', email: 'casey@example.com', avatar: '', role: 'developer' };
const workspaces = [
  { id: 'workspace-a', name: 'Alpha', key: 'ALP' },
  { id: 'workspace-b', name: 'Beta', key: 'BET' },
];
const connections = [
  { id: 'first-connection', generatedBy: 'user-1', workspaceId: 'workspace-a', workspaceName: 'Alpha', workspaceKey: 'ALP', workspaceRole: 'developer', status: 'active', scopes: ['tools/list', 'tools/call:list_projects'], expiresAt: '2099-01-01T00:00:00Z' },
  { id: 'old-connection', generatedBy: 'user-1', workspaceId: 'workspace-b', workspaceName: 'Beta', workspaceKey: 'BET', workspaceRole: 'owner', status: 'active', scopes: ['tools/list'], expiresAt: '2000-01-01T00:00:00Z' },
];

beforeEach(() => {
  mocks.get.mockReset().mockImplementation(async (path: string) => path === '/workspaces' ? workspaces : connections);
  mocks.post.mockReset().mockResolvedValue({ success: true });
});

describe('ExternalAiSection', () => {
  it('groups own connections by workspace with permissions, expiry and independent generation', async () => {
    const user = userEvent.setup();
    render(<ExternalAiSection currentUser={currentUser} />);
    const alpha = await screen.findByRole('region', { name: 'Alpha connections' });
    const beta = screen.getByRole('region', { name: 'Beta connections' });
    expect(within(alpha).getByText('Active')).toBeInTheDocument();
    expect(within(beta).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
    await user.click(within(alpha).getByText('Permissions (1)'));
    expect(within(alpha).getByText('List Projects')).toBeVisible();
    await user.click(within(beta).getByRole('button', { name: 'New connection' }));
    const dialog = screen.getByRole('dialog', { name: 'Connect Beta' });
    expect(within(dialog).getByText('workspace-b')).toBeInTheDocument();
    expect(within(dialog).getByText('Generate only')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate inventory')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Simulate generation' }));
    expect(mocks.get.mock.calls.filter(([path]) => path === '/users/me/mcp/connections')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Close connection' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filters the view through the library workspace selector', async () => {
    const user = userEvent.setup();
    render(<ExternalAiSection currentUser={currentUser} />);
    await screen.findByRole('region', { name: 'Alpha connections' });
    await user.click(screen.getByRole('button', { name: 'Workspace' }));
    await user.click(screen.getByRole('option', { name: 'Beta' }));
    expect(screen.queryByRole('region', { name: 'Alpha connections' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Beta connections' })).toBeInTheDocument();
  });

  it('keeps the generated setup open if refreshing the account inventory fails', async () => {
    const user = userEvent.setup();
    render(<ExternalAiSection currentUser={currentUser} />);
    const alpha = await screen.findByRole('region', { name: 'Alpha connections' });
    await user.click(within(alpha).getByRole('button', { name: 'New connection' }));
    mocks.get.mockRejectedValue(new Error('Inventory unavailable.'));
    await user.click(screen.getByRole('button', { name: 'Simulate generation' }));
    expect(await screen.findByText('Inventory unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Connect Alpha' })).toBeInTheDocument();
  });

  it('revokes using the connection workspace and refreshes its status', async () => {
    const user = userEvent.setup();
    render(<ExternalAiSection currentUser={currentUser} />);
    const alpha = await screen.findByRole('region', { name: 'Alpha connections' });
    mocks.get.mockImplementation(async (path: string) => path === '/workspaces' ? workspaces : connections.map(item => ({ ...item, status: 'revoked' })));
    await user.click(within(alpha).getByRole('button', { name: 'Revoke' }));
    expect(mocks.post).toHaveBeenCalledWith('/workspaces/workspace-a/mcp/connection/first-connection/revoke', {});
    expect(await screen.findByText('Connection revoked for Alpha.')).toBeInTheDocument();
    await waitFor(() => expect(within(alpha).getByText('Revoked')).toBeInTheDocument());
    expect(within(alpha).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('keeps the connection visible and displays the retry delay when revoke is limited', async () => {
    const user = userEvent.setup();
    mocks.post.mockRejectedValue(new ApiError(429, 'Rate limit', { retryAfterSeconds: 17 }));
    render(<ExternalAiSection currentUser={currentUser} />);
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Too many connection requests. Try again in 17 seconds.')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText(/Connection revoked for/)).not.toBeInTheDocument();
  });

  it('shows workspaces with no connections and excludes another issuer from the view', async () => {
    mocks.get.mockImplementation(async (path: string) => path === '/workspaces' ? workspaces : [{ ...connections[0], generatedBy: 'someone-else' }]);
    render(<ExternalAiSection currentUser={currentUser} />);
    await screen.findByRole('region', { name: 'Alpha connections' });
    expect(screen.getAllByText('No connections in this workspace yet.')).toHaveLength(2);
    expect(screen.queryByText('Connection first-co')).not.toBeInTheDocument();
  });

  it('shows an error instead of silently reporting an empty inventory and allows retry', async () => {
    const user = userEvent.setup();
    mocks.get.mockRejectedValue(new Error('Unable to load connections.'));
    render(<ExternalAiSection currentUser={currentUser} />);
    expect(await screen.findByText('Unable to load connections.')).toBeInTheDocument();
    expect(screen.queryByText(/Join or create/)).not.toBeInTheDocument();
    mocks.get.mockImplementation(async (path: string) => path === '/workspaces' ? workspaces : connections);
    await user.click(screen.getByRole('button', { name: 'Refresh connections' }));
    expect(await screen.findByRole('region', { name: 'Alpha connections' })).toBeInTheDocument();
  });

  it('ignores an inventory response after leaving account settings', async () => {
    let resolveConnections!: (value: unknown) => void;
    mocks.get.mockImplementation((path: string) => path === '/workspaces' ? Promise.resolve(workspaces) : new Promise(resolve => { resolveConnections = resolve; }));
    const view = render(<ExternalAiSection currentUser={currentUser} />);
    const signal = mocks.get.mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolveConnections(connections));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
