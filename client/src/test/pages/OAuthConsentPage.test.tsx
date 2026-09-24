import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthConsentPage from '../../modules/mcpOAuth/OAuthConsentPage';
import { type OAuthConsentRequest } from '../../modules/mcpOAuth/api';
import { ProtectedRoute } from '../../router/ProtectedRoute';
import { ApiError } from '../../utils/apiClient';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), redirect: vi.fn(),
  auth: { currentUser: { id: 'user-1', email: 'user@example.com' } as { id: string; email: string } | null, loading: false },
}));
vi.mock('../../utils/apiClient', async importOriginal => ({
  ...await importOriginal<typeof import('../../utils/apiClient')>(), apiClient: { get: mocks.get, post: mocks.post },
}));
vi.mock('../../modules/mcpOAuth/api', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/mcpOAuth/api')>(), redirectToOAuthClient: mocks.redirect,
}));
vi.mock('../../context/auth/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../modules/auth', () => ({ AuthScreen: () => <div>Sign in to Gravity</div> }));

const request: OAuthConsentRequest = {
  requestId: 'request-1', client: { name: 'My AI client', redirectUri: 'https://chatgpt.com/callback?state=untrusted' },
  workspace: { id: 'workspace-1', name: 'Orbit', key: 'ORB' }, expiresAt: new Date(Date.now() + 600000).toISOString(),
  grantTtlSeconds: 2592000, accessTokenTtlSeconds: 3600,
  tools: [
    { name: 'list_tickets', description: 'Read tickets in this workspace', scope: 'tools/call:list_tickets', readOnly: true },
    { name: 'assign_ticket', description: 'Change the assignee', scope: 'tools/call:assign_ticket', readOnly: false },
    { name: 'delete_ticket', description: 'Delete tickets', scope: 'tools/call:delete_ticket', readOnly: false },
  ],
  requestedScopes: ['tools/list', 'tools/call:list_tickets', 'tools/call:assign_ticket'],
};

function renderConsent(url = '/oauth/consent?request=request-1') {
  return render(<MemoryRouter initialEntries={[url]}><OAuthConsentPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = { id: 'user-1', email: 'user@example.com' };
  mocks.get.mockResolvedValue({ ...request, expiresAt: new Date(Date.now() + 600000).toISOString() });
  mocks.post.mockResolvedValue({ redirectUrl: 'https://chatgpt.com/callback?code=code-1&state=state-1' });
});
afterEach(() => vi.useRealTimers());

describe('OAuth consent', () => {
  it('shows the client and fixed workspace, selects only requested reads, and approves exact selected scopes', async () => {
    const user = userEvent.setup();
    renderConsent();
    expect(await screen.findByText('My AI client')).toBeInTheDocument();
    expect(screen.getByText('Orbit')).toBeInTheDocument();
    expect(screen.getByText('chatgpt.com')).toBeInTheDocument();
    expect(screen.getByText('Signed in as user@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Access lasts 30 days/)).toHaveTextContent('Access tokens expire after 1 hour');
    expect(screen.getByLabelText('List Tickets (read)')).toBeChecked();
    expect(screen.getByLabelText('Assign Ticket (write)')).not.toBeChecked();
    expect(screen.queryByLabelText('Delete Ticket (write)')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('List Tickets (read)'));
    await user.click(screen.getByLabelText('Assign Ticket (write)'));
    await user.click(screen.getByRole('button', { name: 'Approve connection' }));
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/mcp/oauth/requests/request-1', {
      approved: true, scopes: ['tools/list', 'tools/call:assign_ticket'],
    }, { credentials: 'same-origin' });
    expect(mocks.redirect).toHaveBeenCalledWith('https://chatgpt.com/callback?code=code-1&state=state-1');
    expect(screen.getByRole('button', { name: 'Approve connection' })).toBeDisabled();
  });

  it('denies without granting scopes and ignores redirect parameters supplied in the page URL', async () => {
    const user = userEvent.setup();
    mocks.post.mockResolvedValue({ redirectUrl: 'https://chatgpt.com/callback?error=access_denied' });
    renderConsent('/oauth/consent?request=request-1&redirect_uri=https://evil.example');
    await user.click(await screen.findByRole('button', { name: 'Deny' }));
    expect(mocks.post).toHaveBeenCalledWith('/mcp/oauth/requests/request-1', { approved: false }, { credentials: 'same-origin' });
    expect(mocks.redirect).toHaveBeenCalledWith('https://chatgpt.com/callback?error=access_denied');
  });

  it('bulk selection stays inside requested permissions and can restore read-only defaults', async () => {
    const user = userEvent.setup();
    renderConsent();
    await user.click(await screen.findByRole('button', { name: 'Select All' }));
    expect(screen.getByLabelText('Assign Ticket (write)')).toBeChecked();
    expect(screen.queryByLabelText('Delete Ticket (write)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByLabelText('List Tickets (read)')).not.toBeChecked();
    expect(screen.getByLabelText('Assign Ticket (write)')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Read only' }));
    expect(screen.getByLabelText('List Tickets (read)')).toBeChecked();
    expect(screen.getByLabelText('Assign Ticket (write)')).not.toBeChecked();
    expect(screen.getByText(/The client supplies its name/)).toBeInTheDocument();
  });

  it('keeps the request in the URL while signing in and fetches it only after authentication', async () => {
    mocks.auth.currentUser = null;
    const view = render(<MemoryRouter initialEntries={['/oauth/consent?request=request-1']}><ProtectedRoute><OAuthConsentPage /></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Sign in to Gravity')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.auth.currentUser = { id: 'user-1', email: 'user@example.com' };
    view.rerender(<MemoryRouter initialEntries={['/oauth/consent?request=request-1']}><ProtectedRoute><OAuthConsentPage /></ProtectedRoute></MemoryRouter>);
    expect(await screen.findByText('My AI client')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/mcp/oauth/requests/request-1', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
  });

  it('prevents duplicate approvals while a decision is pending', async () => {
    const user = userEvent.setup();
    let resolve!: (response: { redirectUrl: string }) => void;
    mocks.post.mockImplementation(() => new Promise(done => { resolve = done; }));
    renderConsent();
    await user.dblClick(await screen.findByRole('button', { name: 'Approve connection' }));
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
    await act(async () => resolve({ redirectUrl: 'https://chatgpt.com/callback?code=one-use' }));
    expect(mocks.redirect).toHaveBeenCalledOnce();
  });

  it('blocks an expired request and expires a loaded request while the page remains open', async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue({ ...request, expiresAt: new Date(Date.now() + 1000).toISOString() });
    renderConsent();
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Approve connection' })).toBeEnabled();
    await act(async () => { vi.advanceTimersByTime(1001); });
    expect(screen.getByRole('alert')).toHaveTextContent('request has expired');
    expect(screen.getByRole('button', { name: 'Approve connection' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('offers a retry after a network failure and gives a restart instruction for a consumed request', async () => {
    const user = userEvent.setup();
    mocks.get.mockRejectedValueOnce(new Error('Connection interrupted'));
    renderConsent();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('My AI client')).toBeInTheDocument();
    mocks.post.mockRejectedValueOnce(new ApiError(409, 'Request used'));
    await user.click(screen.getByRole('button', { name: 'Approve connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Restart the connection from your AI client');
    expect(screen.getByRole('button', { name: 'Approve connection' })).toBeDisabled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('preserves selected permissions after a rate limit and shows its retry delay', async () => {
    const user = userEvent.setup();
    mocks.post.mockRejectedValueOnce(new ApiError(429, 'Too many requests', { retryAfterSeconds: 17 }));
    renderConsent();
    await user.click(await screen.findByLabelText('Assign Ticket (write)'));
    await user.click(screen.getByRole('button', { name: 'Approve connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 17 seconds');
    expect(screen.getByLabelText('Assign Ticket (write)')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Approve connection' })).toBeEnabled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('does not fetch a missing request or turn untrusted client names into markup', async () => {
    const view = renderConsent('/oauth/consent');
    expect(screen.getByRole('alert')).toHaveTextContent('missing a connection request');
    expect(mocks.get).not.toHaveBeenCalled();
    view.unmount();
    mocks.get.mockResolvedValue({ ...request, client: { ...request.client, name: '<img src=x onerror=alert(1)>' } });
    renderConsent();
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('cancels the old request and discards its response when the consent URL changes', async () => {
    const user = userEvent.setup();
    let resolveOld!: (value: OAuthConsentRequest) => void;
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    mocks.get.mockResolvedValueOnce({ ...request, requestId: 'request-2', client: { ...request.client, name: 'Second client' } });
    function SwitchRequest() {
      const navigate = useNavigate();
      return <><button onClick={() => navigate('/oauth/consent?request=request-2')}>Switch request</button><OAuthConsentPage /></>;
    }
    render(<MemoryRouter initialEntries={['/oauth/consent?request=request-1']}><SwitchRequest /></MemoryRouter>);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
    const previousSignal = mocks.get.mock.calls[0][1].signal;
    await user.click(screen.getByRole('button', { name: 'Switch request' }));
    expect(await screen.findByText('Second client')).toBeInTheDocument();
    expect(previousSignal.aborted).toBe(true);
    await act(async () => resolveOld(request));
    expect(screen.queryByText('My AI client')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve connection' }));
    expect(mocks.post).toHaveBeenCalledWith('/mcp/oauth/requests/request-2', expect.any(Object), expect.any(Object));
  });
});
