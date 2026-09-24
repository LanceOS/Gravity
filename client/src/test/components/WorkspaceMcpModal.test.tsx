import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceMcpModal } from '../../modules/workspaces/components/WorkspaceMcpModal';
import { apiClient, ApiError } from '../../utils/apiClient';

const mocks = vi.hoisted(() => ({ createConnection: vi.fn(), revokeConnection: vi.fn(), listConnections: vi.fn(), catalog: {
  loading: false, error: null, tools: [
    { name: 'list_tickets', description: 'Read tickets', inputSchema: {}, annotations: { readOnlyHint: true }, allowedForConnection: true },
    { name: 'assign_ticket', description: 'Assign a ticket', inputSchema: {}, annotations: { readOnlyHint: false }, allowedForConnection: true },
    { name: 'delete_ticket', description: 'Delete ticket', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: true }, allowedForConnection: false },
  ],
} }));
vi.mock('../../hooks/useMcpCatalog', () => ({ useMcpCatalog: () => mocks.catalog }));
vi.mock('../../hooks/useWorkspaceMcp', () => ({ default: () => mocks }));

const payload = {
  id: 'connection-1', scopes: ['tools/list', 'tools/call:list_tickets'],
  args: { mcpEndpoint: 'https://gravity.example/api/v1/mcp', workspaceId: 'workspace-1' },
  auth: { token: 'secret-test-token', expiresAt: '2099-09-24T12:00:00Z', singleUse: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listConnections.mockResolvedValue([]);
  mocks.createConnection.mockResolvedValue(payload);
  mocks.revokeConnection.mockResolvedValue({ success: true });
});

afterEach(() => vi.restoreAllMocks());

describe('WorkspaceMcpModal', () => {
  it('defaults to exact read scopes and exports a reusable complete configuration', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('List Tickets (read)')).toBeChecked());
    expect(screen.getByLabelText('Assign Ticket (write)')).not.toBeChecked();
    expect(screen.getByLabelText('Delete Ticket (delete)')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    await waitFor(() => expect(mocks.createConnection).toHaveBeenCalledWith({ scopes: ['tools/list', 'tools/call:list_tickets'], ttlSeconds: 86400, singleUse: false, bindToIp: false }));
    expect(screen.getByRole('alert')).toHaveTextContent('Connection generated successfully.');
    expect(screen.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('MCP server URL')).toHaveValue(payload.args.mcpEndpoint);
    expect(screen.getByLabelText('Transport')).toHaveValue('Streamable HTTP');
    expect(screen.getByLabelText('Bearer token')).toHaveValue(payload.auth.token);
    expect(screen.getByLabelText('Bearer token')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Authorization header value')).toHaveValue(`Bearer ${payload.auth.token}`);
    expect(screen.getByLabelText('Workspace ID')).toHaveValue(payload.args.workspaceId);
    expect(screen.getByText('Header name: X-Workspace-Id')).toBeInTheDocument();
    expect(screen.getByText(/For ChatGPT, choose OAuth sign-in above/)).toBeInTheDocument();
    for (const [name, value] of [
      ['mcp server url', payload.args.mcpEndpoint], ['transport', 'Streamable HTTP'],
      ['bearer token', payload.auth.token], ['authorization header value', `Bearer ${payload.auth.token}`],
      ['workspace id', payload.args.workspaceId],
    ]) {
      await user.click(screen.getByRole('button', { name: `Copy ${name}` }));
      expect(writeText).toHaveBeenLastCalledWith(value);
    }
    await user.click(screen.getByRole('button', { name: 'Show bearer token' }));
    expect(screen.getByLabelText('Bearer token')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    const config = screen.getByLabelText('Client configuration') as HTMLTextAreaElement;
    expect(JSON.parse(config.value).mcpServers.gravity).toEqual({ url: payload.args.mcpEndpoint, headers: { Authorization: 'Bearer secret-test-token', 'X-Workspace-Id': 'workspace-1' } });
    await user.click(screen.getByRole('button', { name: 'Copy configuration' }));
    expect(writeText).toHaveBeenCalledWith(config.value);
    await user.click(screen.getByRole('button', { name: 'Connection lifetime' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Client configuration')).toHaveValue(config.value);
  });

  it('allows granular write selection and retains the credential after copy failure', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Select All' }));
    expect(screen.getByLabelText('List Tickets (read)')).toBeChecked();
    expect(screen.getByLabelText('Assign Ticket (write)')).toBeChecked();
    expect(screen.getByLabelText('Delete Ticket (delete)')).not.toBeChecked();
    await user.click(screen.getByLabelText('List Tickets (read)'));
    await user.click(screen.getByRole('button', { name: 'Connection lifetime' }));
    await user.click(screen.getByRole('option', { name: '1 hour' }));
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    await waitFor(() => expect(mocks.createConnection).toHaveBeenCalledWith({ scopes: ['tools/list', 'tools/call:assign_ticket'], ttlSeconds: 3600, singleUse: false, bindToIp: false }));
    await user.click(screen.getByRole('button', { name: 'Copy configuration' }));
    expect(await screen.findByText(/Unable to copy/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    expect((screen.getByLabelText('Client configuration') as HTMLTextAreaElement).value).toContain('secret-test-token');
    expect(screen.getByRole('button', { name: 'Download configuration' })).toBeInTheDocument();
  });

  it('lists and revokes existing connections and clears generated credentials on close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.listConnections.mockResolvedValue([{ id: 'connection-1', status: 'active', scopes: payload.scopes, expiresAt: payload.auth.expiresAt }]);
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={onClose} />);
    await user.click(await screen.findByRole('button', { name: 'Revoke connection connection-1' }));
    await waitFor(() => expect(mocks.revokeConnection).toHaveBeenCalledWith('connection-1'));
    expect(await screen.findByText('connection-1 · Revoked')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    await user.click(await screen.findByRole('tab', { name: 'JSON' }));
    expect(await screen.findByLabelText('Client configuration')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByLabelText('Client configuration')).not.toBeInTheDocument();
    expect(screen.queryByText(/Connection generated successfully/)).not.toBeInTheDocument();
  });

  it('keeps a generated connection usable when refreshing the connection list fails', async () => {
    const user = userEvent.setup();
    mocks.listConnections.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network failed'));
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    expect(await screen.findByText(/Connection generated successfully/)).toBeInTheDocument();
    expect(await screen.findByText(/connection list could not be refreshed/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    expect((screen.getByLabelText('Client configuration') as HTMLTextAreaElement).value).toContain('secret-test-token');
  });

  it('does not report success when generation fails', async () => {
    const user = userEvent.setup();
    mocks.createConnection.mockRejectedValueOnce(new Error('Unable to generate connection'));
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to generate connection');
    expect(screen.queryByText(/Connection generated successfully/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Client configuration')).not.toBeInTheDocument();
  });

  it('shows the retry delay without discarding a previous credential when another generation is rate limited', async () => {
    const user = userEvent.setup();
    mocks.createConnection.mockResolvedValueOnce(payload).mockRejectedValueOnce(new ApiError(429, 'Too many requests', { retryAfterSeconds: 42 }));
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    expect(await screen.findByText(/Connection generated successfully/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    const config = (screen.getByLabelText('Client configuration') as HTMLTextAreaElement).value;

    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many connection requests. Try again in 42 seconds.');
    expect(screen.queryByText(/Connection generated successfully/)).not.toBeInTheDocument();
    expect(screen.getByText('Previously generated connection configuration.')).toBeInTheDocument();
    expect(screen.getByLabelText('Client configuration')).toHaveValue(config);
    expect(screen.getByRole('button', { name: 'Copy configuration' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download configuration' })).toBeEnabled();
  });

  it('shows the retry delay and keeps the connection active when revocation is rate limited', async () => {
    const user = userEvent.setup();
    mocks.listConnections.mockResolvedValue([{ id: 'connection-1', status: 'active', scopes: payload.scopes, expiresAt: payload.auth.expiresAt }]);
    mocks.revokeConnection.mockRejectedValueOnce(new ApiError(429, 'Too many requests', { retryAfterSeconds: 17 }));
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Revoke connection connection-1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many connection requests. Try again in 17 seconds.');
    expect(screen.getByText('connection-1 · active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke connection connection-1' })).toBeEnabled();
  });

  it('gives a useful retry message when rate limiting has no delay metadata', async () => {
    const user = userEvent.setup();
    mocks.createConnection.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many connection requests. Please wait before trying again.');
    expect(screen.queryByText(/Connection generated successfully/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Client configuration')).not.toBeInTheDocument();
  });

  it('notifies account inventory after generation while keeping inventory out of the modal', async () => {
    const user = userEvent.setup();
    const onConnectionsChanged = vi.fn();
    render(<WorkspaceMcpModal workspaceId="workspace-1" workspaceName="Orbit" isOpen showConnections={false}
      onConnectionsChanged={onConnectionsChanged} onClose={vi.fn()} />);
    expect(screen.getByText(/Connect an AI client to Orbit/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connections' })).not.toBeInTheDocument();
    expect(mocks.listConnections).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    expect(await screen.findByLabelText('Bearer token')).toHaveValue(payload.auth.token);
    expect(onConnectionsChanged).toHaveBeenCalledOnce();
    expect(mocks.listConnections).not.toHaveBeenCalled();
  });

  it('refreshes account inventory after a pending generation finishes but never redisplays a closed secret', async () => {
    const user = userEvent.setup();
    const onConnectionsChanged = vi.fn();
    let resolveConnection: (value: typeof payload) => void = () => {};
    mocks.createConnection.mockImplementationOnce(() => new Promise(resolve => { resolveConnection = resolve; }));
    const view = render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen showConnections={false}
      onConnectionsChanged={onConnectionsChanged} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    view.rerender(<WorkspaceMcpModal workspaceId="workspace-1" isOpen={false} showConnections={false}
      onConnectionsChanged={onConnectionsChanged} onClose={vi.fn()} />);
    await act(async () => resolveConnection(payload));
    expect(onConnectionsChanged).toHaveBeenCalledOnce();
    view.rerender(<WorkspaceMcpModal workspaceId="workspace-1" isOpen showConnections={false}
      onConnectionsChanged={onConnectionsChanged} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Bearer token')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'JSON' })).not.toBeInTheDocument();
  });

  it('shows ChatGPT OAuth setup before generation without exposing manual credentials', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const endpoint = 'https://gravity.example/api/v1/workspaces/workspace-1/mcp';
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ mcpEndpoint: endpoint, oauthEnabled: true });
    render(<WorkspaceMcpModal workspaceId="workspace-1" workspaceName="Orbit" isOpen showConnections={false} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'AI client' }));
    await user.click(screen.getByRole('option', { name: 'ChatGPT (OAuth sign-in)' }));
    expect(await screen.findByLabelText('MCP server URL')).toHaveValue(endpoint);
    expect(get).toHaveBeenCalledWith('/workspaces/workspace-1/mcp/setup', { signal: expect.any(AbortSignal) });
    expect(screen.getByLabelText('Connection name')).toHaveValue('Gravity — Orbit');
    expect(screen.getByLabelText('Authentication')).toHaveValue('OAuth');
    expect(screen.getByText(/choose the tools it can use on Gravity’s consent screen/i)).toBeInTheDocument();
    expect(screen.getByText(/public HTTPS or a configured Secure MCP Tunnel/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ChatGPT setup guide' })).toHaveAttribute('href', 'https://developers.openai.com/plugins/deploy/connect-chatgpt');
    expect(screen.queryByRole('button', { name: 'Generate connection' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bearer token')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workspace ID')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connection lifetime' })).not.toBeInTheDocument();
    expect(mocks.createConnection).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Copy mcp server url' }));
    expect(writeText).toHaveBeenLastCalledWith(endpoint);
    expect(new URL(writeText.mock.calls[0][0]).search).toBe('');
  });

  it('does not reuse a stale OAuth setup response after changing workspaces', async () => {
    const user = userEvent.setup();
    let resolveOld: (value: unknown) => void = () => {};
    const newEndpoint = 'https://gravity.example/api/v1/workspaces/workspace-2/mcp';
    vi.spyOn(apiClient, 'get').mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ mcpEndpoint: newEndpoint, oauthEnabled: true });
    const view = render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen showConnections={false} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'AI client' }));
    await user.click(screen.getByRole('option', { name: 'ChatGPT (OAuth sign-in)' }));
    expect(screen.getByText('Loading ChatGPT setup…')).toBeInTheDocument();
    view.rerender(<WorkspaceMcpModal workspaceId="workspace-2" isOpen showConnections={false} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'AI client' }));
    await user.click(screen.getByRole('option', { name: 'ChatGPT (OAuth sign-in)' }));
    expect(await screen.findByLabelText('MCP server URL')).toHaveValue(newEndpoint);
    await act(async () => resolveOld({ mcpEndpoint: 'https://gravity.example/api/v1/workspaces/workspace-1/mcp', oauthEnabled: true }));
    expect(screen.getByLabelText('MCP server URL')).toHaveValue(newEndpoint);
  });

  it('reports and retries OAuth setup failures without generating a bearer token', async () => {
    const user = userEvent.setup();
    const endpoint = 'https://gravity.example/api/v1/workspaces/workspace-1/mcp';
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('Setup unavailable'))
      .mockResolvedValue({ mcpEndpoint: endpoint, oauthEnabled: true });
    render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen showConnections={false} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'AI client' }));
    await user.click(screen.getByRole('option', { name: 'ChatGPT (OAuth sign-in)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Setup unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry setup' }));
    expect(await screen.findByLabelText('MCP server URL')).toHaveValue(endpoint);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it('does not show a previous workspace credential after a pending request completes', async () => {
    const user = userEvent.setup();
    let resolveConnection: (value: typeof payload) => void = () => {};
    mocks.createConnection.mockImplementationOnce(() => new Promise(resolve => { resolveConnection = resolve; }));
    const view = render(<WorkspaceMcpModal workspaceId="workspace-1" isOpen onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Generate connection' }));
    view.rerender(<WorkspaceMcpModal workspaceId="workspace-2" isOpen onClose={vi.fn()} />);
    resolveConnection(payload);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate connection' })).toBeEnabled());
    expect(screen.queryByLabelText('Client configuration')).not.toBeInTheDocument();
  });
});
