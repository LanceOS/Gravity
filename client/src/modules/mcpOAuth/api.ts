import { apiClient } from '../../utils/apiClient';

export interface OAuthConsentRequest {
  requestId: string;
  client: { name: string; redirectUri: string };
  workspace: { id: string; name: string; key: string };
  expiresAt: string;
  grantTtlSeconds: number;
  accessTokenTtlSeconds: number;
  tools: Array<{ name: string; description: string; scope: string; readOnly: boolean }>;
  requestedScopes: string[];
}

export function getOAuthConsentRequest(requestId: string, signal: AbortSignal) {
  return apiClient.get<OAuthConsentRequest>(`/mcp/oauth/requests/${encodeURIComponent(requestId)}`, {
    credentials: 'same-origin', signal,
  });
}

export function submitOAuthConsent(requestId: string, decision: { approved: boolean; scopes?: string[] }) {
  return apiClient.post<{ redirectUrl: string }>(`/mcp/oauth/requests/${encodeURIComponent(requestId)}`, decision, {
    credentials: 'same-origin',
  });
}

/** Only navigate to a callback returned by the server after it validates the request. */
export function redirectToOAuthClient(redirectUrl: string) {
  const url = new URL(redirectUrl);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('The client returned an unsupported callback address. Restart the connection from your AI client.');
  window.location.assign(url.href);
}
