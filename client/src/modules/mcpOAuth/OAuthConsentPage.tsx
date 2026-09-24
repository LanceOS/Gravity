import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button } from '@library';
import { useAuth } from '../../context/auth/AuthContext';
import { ApiError } from '../../utils/apiClient';
import { mcpToolLabel } from '../../utils/mcp';
import { getOAuthConsentRequest, redirectToOAuthClient, submitOAuthConsent, type OAuthConsentRequest } from './api';
import './oauthConsent.css';

function consentError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your sign-in has expired. Reload this page to sign in again.';
    if (error.status === 403) return 'You no longer have access to this workspace or its requested permissions. Restart the connection from your AI client.';
    if ([404, 409, 410].includes(error.status)) return 'This connection request has expired, has already been used, or belongs to another sign-in session. Restart the connection from your AI client.';
    if (error.status === 429) {
      const seconds = error.data?.retryAfterSeconds;
      return typeof seconds === 'number' && seconds > 0
        ? `Too many connection requests. Try again in ${Math.ceil(seconds)} seconds.`
        : 'Too many connection requests. Please wait before trying again.';
    }
  }
  return error instanceof Error ? error.message : 'Unable to load the connection request. Please try again.';
}

function duration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} ${seconds === 86400 ? 'day' : 'days'}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} ${seconds === 3600 ? 'hour' : 'hours'}`;
  return `${Math.ceil(seconds / 60)} minutes`;
}

function callbackHost(redirectUri: string) {
  try { return new URL(redirectUri).host; } catch { return redirectUri; }
}

function ConsentRequest({ requestId, accountEmail }: { requestId: string; accountEmail?: string }) {
  const [request, setRequest] = useState<OAuthConsentRequest | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!requestId) {
      setError('This page is missing a connection request. Start the connection from your AI client.');
      setUnavailable(true);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRequest(null);
    getOAuthConsentRequest(requestId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.requestId !== requestId || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('The server returned an invalid connection request. Restart the connection from your AI client.');
      setRequest(result);
      setSelectedScopes(result.tools.filter(tool => tool.readOnly && result.requestedScopes.includes(tool.scope)).map(tool => tool.scope));
    }).catch(loadError => {
      if (controller.signal.aborted) return;
      setError(consentError(loadError));
      setUnavailable(loadError instanceof ApiError && [401, 403, 404, 409, 410].includes(loadError.status));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [requestId, attempt]);

  useEffect(() => {
    if (!request) return;
    const remaining = Date.parse(request.expiresAt) - Date.now();
    setExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [request]);

  const tools = request?.tools.filter(tool => request.requestedScopes.includes(tool.scope)) ?? [];
  const blocked = loading || submitting || completed || expired || unavailable;

  async function decide(approved: boolean) {
    if (!request || blocked || pending.current || Date.parse(request.expiresAt) <= Date.now()) return;
    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const scopes = ['tools/list', ...tools.filter(tool => selectedScopes.includes(tool.scope)).map(tool => tool.scope)];
      const result = await submitOAuthConsent(requestId, approved ? { approved, scopes } : { approved });
      if (!active.current) return;
      setCompleted(true);
      redirectToOAuthClient(result.redirectUrl);
    } catch (submitError) {
      if (!active.current) return;
      setError(consentError(submitError));
      setUnavailable(submitError instanceof ApiError && [401, 403, 404, 409, 410].includes(submitError.status));
    } finally {
      pending.current = false;
      if (active.current) setSubmitting(false);
    }
  }

  return (
    <main className="oauth-consent">
      <section className="oauth-consent__card" aria-labelledby="oauth-consent-title">
        <header className="oauth-consent__header">
          <span className="oauth-consent__brand">Gravity</span>
          <h1 id="oauth-consent-title">Connect your AI client</h1>
          {accountEmail && <p>Signed in as {accountEmail}</p>}
        </header>
        {loading && <p role="status">Loading connection request…</p>}
        {error && <Alert type="error">{error}</Alert>}
        {expired && !completed && <Alert type="error">This connection request has expired. Restart the connection from your AI client.</Alert>}
        {!loading && !request && !unavailable && <Button variant="default" onClick={() => setAttempt(value => value + 1)}>Try again</Button>}
        {request && (
          <>
            <div className="oauth-consent__summary">
              <p><strong>{request.client.name}</strong> wants access to <strong>{request.workspace.name}</strong> ({request.workspace.key}).</p>
              <p>Client callback: <span className="oauth-consent__host">{callbackHost(request.client.redirectUri)}</span></p>
              <p className="oauth-consent__description">The client supplies its name. Check the callback address to identify where approval will return you.</p>
              <p>Access lasts {duration(request.grantTtlSeconds)} unless you revoke it in <Link to="/account?section=connections" target="_blank" rel="noopener noreferrer">Account Preferences → Connect External AI</Link>. Access tokens expire after {duration(request.accessTokenTtlSeconds)} and can be renewed during that period.</p>
            </div>
            <fieldset className="oauth-consent__permissions" disabled={blocked}>
              <legend>Choose permissions</legend>
              <p>The client can list the tools you approve. Only selected tools can be used.</p>
              {tools.length > 0 && <div className="oauth-consent__selection-actions">
                <Button size="sm" variant="ghost" onClick={() => setSelectedScopes(tools.filter(tool => tool.readOnly).map(tool => tool.scope))}>Read only</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedScopes(tools.map(tool => tool.scope))}>Select All</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedScopes([])}>Clear selection</Button>
              </div>}
              {[true, false].map(readOnly => {
                const group = tools.filter(tool => tool.readOnly === readOnly);
                return group.length > 0 && (
                  <div className="oauth-consent__group" key={String(readOnly)}>
                    <h2>{readOnly ? 'Read workspace data' : 'Make changes'}</h2>
                    {!readOnly && <p>These tools can create, change, or delete workspace data.</p>}
                    {group.map(tool => (
                      <label className="oauth-consent__tool" key={tool.scope}>
                        <input type="checkbox" checked={selectedScopes.includes(tool.scope)}
                          onChange={event => setSelectedScopes(current => event.target.checked ? [...current, tool.scope] : current.filter(scope => scope !== tool.scope))}
                          aria-label={`${mcpToolLabel(tool.name)} (${readOnly ? 'read' : 'write'})`} />
                        <span><strong>{mcpToolLabel(tool.name)}</strong><span className="oauth-consent__description">{tool.description}</span></span>
                      </label>
                    ))}
                  </div>
                );
              })}
              {tools.length === 0 && <p>No tool execution permissions were requested.</p>}
            </fieldset>
            <p className="oauth-consent__deadline">Approve by {new Date(request.expiresAt).toLocaleString()}.</p>
            {completed && !error && <p role="status">Returning to your AI client…</p>}
            <div className="oauth-consent__actions">
              <Button variant="default" disabled={blocked} onClick={() => void decide(false)}>Deny</Button>
              <Button variant="primary" disabled={blocked} loading={submitting} onClick={() => void decide(true)}>Approve connection</Button>
            </div>
          </>
        )}
        <Link to="/account?section=connections" className="oauth-consent__account-link">Back to Account Preferences</Link>
      </section>
    </main>
  );
}

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const { currentUser } = useAuth();
  const requestId = params.get('request')?.trim() ?? '';
  return <ConsentRequest key={`${currentUser?.id}:${requestId}`} requestId={requestId} accountEmail={currentUser?.email} />;
}
