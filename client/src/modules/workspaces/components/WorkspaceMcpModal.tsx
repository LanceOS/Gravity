import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Select, Tabs, TextInput } from '@library';
import { FormSection } from '../../../components/FormSection';
import { ModalDialog } from '../../../components/ModalDialog';
import useWorkspaceMcp from '../../../hooks/useWorkspaceMcp';
import { useMcpCatalog } from '../../../hooks/useMcpCatalog';
import { ApiError } from '../../../utils/apiClient';
import { buildMcpClientConfig, buildMcpConnectionFields, getMcpOAuthSetup, mcpToolLabel, type McpConnection, type McpConnectionField, type McpConnectionPayload } from '../../../utils/mcp';

type Props = {
  workspaceId?: string;
  workspaceName?: string;
  isOpen: boolean;
  onClose: () => void;
  showConnections?: boolean;
  onConnectionsChanged?: () => void;
};

const connectionLifetimeOptions = [
  { value: '300', label: '5 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '24 hours' },
];

function connectionRequestError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 429) {
    const retryAfterSeconds = error.data?.retryAfterSeconds;
    if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      const seconds = Math.ceil(retryAfterSeconds);
      return `Too many connection requests. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
    }
    return 'Too many connection requests. Please wait before trying again.';
  }
  return error instanceof Error ? error.message : fallback;
}

function ConnectionSetupField({ field, copied, onCopy }: {
  field: McpConnectionField;
  copied: boolean;
  onCopy: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hintId = useId();
  return (
    <div style={{ display: 'grid', gap: 'var(--space-xs)' }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 'var(--space-sm)' }}>
        <TextInput label={field.label} readOnly value={field.value}
          type={field.secret && !revealed ? 'password' : 'text'}
          autoComplete="off" spellCheck={false} aria-describedby={field.hint ? hintId : undefined}
          onFocus={event => event.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
        {field.secret && <Button type="button" variant="secondary" size="sm"
          aria-label={`${revealed ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`}
          onClick={() => setRevealed(value => !value)}>{revealed ? 'Hide' : 'Show'}</Button>}
        <Button type="button" variant="secondary" size="sm" aria-label={`Copy ${field.label.toLowerCase()}`}
          onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      {field.hint && <p id={hintId} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{field.hint}</p>}
    </div>
  );
}

export function WorkspaceMcpModal({ workspaceId, workspaceName, isOpen, onClose, showConnections = true, onConnectionsChanged }: Props) {
  const mcp = useWorkspaceMcp(workspaceId);
  const [clientMode, setClientMode] = useState<'headers' | 'chatgpt'>('headers');
  const catalog = useMcpCatalog(workspaceId, isOpen && clientMode === 'headers');
  const [oauthSetup, setOAuthSetup] = useState<{ workspaceId: string; endpoint: string } | null>(null);
  const [oauthSetupLoading, setOAuthSetupLoading] = useState(false);
  const [oauthSetupError, setOAuthSetupError] = useState<string | null>(null);
  const [oauthSetupVersion, setOAuthSetupVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [result, setResult] = useState<McpConnectionPayload | null>(null);
  const [showGeneratedSuccess, setShowGeneratedSuccess] = useState(false);
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [ttlSeconds, setTtlSeconds] = useState(86400);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const setupId = useId();
  const requestVersion = useRef(0);
  const generatedConnectionRef = useRef<HTMLDivElement>(null);
  const allowedTools = useMemo(() => catalog.tools.filter(tool => tool.allowedForConnection !== false), [catalog.tools]);
  const configText = result ? JSON.stringify(buildMcpClientConfig(result), null, 2) : '';

  useEffect(() => {
    setSelectedTools(allowedTools.filter(tool => tool.annotations?.readOnlyHint === true).map(tool => tool.name));
  }, [allowedTools]);

  useEffect(() => {
    if (result) generatedConnectionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [result]);

  useEffect(() => {
    setOAuthSetup(null);
    setOAuthSetupError(null);
    setOAuthSetupLoading(false);
    if (!isOpen || !workspaceId || clientMode !== 'chatgpt') return;
    const controller = new AbortController();
    setOAuthSetupLoading(true);
    void getMcpOAuthSetup(workspaceId, controller.signal).then(setup => {
      if (!controller.signal.aborted) setOAuthSetup({ workspaceId, endpoint: setup.mcpEndpoint });
    }).catch(setupError => {
      if (!controller.signal.aborted) setOAuthSetupError(connectionRequestError(setupError, 'Unable to load ChatGPT setup.'));
    }).finally(() => {
      if (!controller.signal.aborted) setOAuthSetupLoading(false);
    });
    return () => controller.abort();
  }, [isOpen, workspaceId, clientMode, oauthSetupVersion]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setResult(null);
    setClientMode('headers');
    setShowGeneratedSuccess(false);
    setError(null);
    setCopied(null);
    setLoading(false);
    setRevokingId(null);
    setConnections([]);
    if (!isOpen || !workspaceId || !showConnections) {
      setConnectionsLoading(false);
      return () => { requestVersion.current++; };
    }
    const controller = new AbortController();
    setConnectionsLoading(true);
    void mcp.listConnections(controller.signal).then(data => {
      if (requestVersion.current === version) setConnections(data);
    }).catch(err => {
      if (!controller.signal.aborted && requestVersion.current === version) setError(err instanceof Error ? err.message : 'Unable to load connections.');
    }).finally(() => {
      if (requestVersion.current === version) setConnectionsLoading(false);
    });
    return () => { controller.abort(); requestVersion.current++; };
  }, [isOpen, workspaceId, mcp, showConnections]);

  function notifyConnectionsChanged() {
    // Inventory refresh is independent of this modal's lifetime or current workspace.
    void Promise.resolve().then(() => onConnectionsChanged?.()).catch(() => {});
  }

  async function handleCreate() {
    const version = requestVersion.current;
    setLoading(true);
    setShowGeneratedSuccess(false);
    setError(null);
    setCopied(null);
    try {
      const scopes = ['tools/list', ...allowedTools.filter(tool => selectedTools.includes(tool.name)).map(tool => tool.scope || `tools/call:${tool.name}`)];
      const payload = await mcp.createConnection({ scopes, ttlSeconds, singleUse: false, bindToIp: false });
      if (!payload.auth?.token || !payload.args?.mcpEndpoint) throw new Error('The server did not return a complete connection configuration.');
      notifyConnectionsChanged();
      if (requestVersion.current !== version) return;
      setResult(payload);
      setShowGeneratedSuccess(true);
      if (showConnections) try {
        const list = await mcp.listConnections();
        if (requestVersion.current === version) setConnections(list);
      } catch {
        if (requestVersion.current === version) setError('Your connection was generated, but the connection list could not be refreshed. You can still use the configuration below.');
      }
    } catch (err) {
      if (requestVersion.current === version) setError(connectionRequestError(err, 'Unable to generate connection.'));
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }

  async function handleCopy(value = configText, field = 'json') {
    const version = requestVersion.current;
    try {
      await navigator.clipboard.writeText(value);
      if (requestVersion.current === version) { setCopied(field); setError(null); }
    } catch {
      if (requestVersion.current === version) setError(clientMode === 'chatgpt'
        ? 'Unable to copy. Select the value to copy it manually.'
        : 'Unable to copy. Select the value to copy it manually, or download the JSON configuration.');
    }
  }

  function handleDownload() {
    const blob = new Blob([configText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'gravity-mcp.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRevoke(id: string) {
    const version = requestVersion.current;
    setRevokingId(id);
    setError(null);
    try {
      await mcp.revokeConnection(id);
      notifyConnectionsChanged();
      if (requestVersion.current !== version) return;
      if (result?.id === id) { setResult(null); setShowGeneratedSuccess(false); setCopied(null); }
      setConnections(items => items.map(item => item.id === id ? { ...item, status: 'revoked', revokedAt: new Date().toISOString() } : item));
    } catch (err) {
      if (requestVersion.current === version) setError(connectionRequestError(err, 'Unable to revoke connection.'));
    } finally {
      if (requestVersion.current === version) setRevokingId(null);
    }
  }

  function handleClose() {
    requestVersion.current++;
    setResult(null);
    setShowGeneratedSuccess(false);
    setCopied(null);
    onClose();
  }

  return (
    <ModalDialog.Root isOpen={isOpen} onClose={handleClose} size="md">
      <ModalDialog.Header title="Connect External AI" description={workspaceName
        ? `Connect an AI client to ${workspaceName}. Choose its authentication method below.`
        : 'Connect an AI client to this workspace. Choose its authentication method below.'} />
      <ModalDialog.Body>
        <FormSection.Root as="div">
          {error && <ModalDialog.Feedback type="error">{error}</ModalDialog.Feedback>}
          <div onKeyDown={event => {
            if (event.key === 'Escape' && event.defaultPrevented) event.stopPropagation();
          }}>
            <Select label="AI client" value={clientMode} disabled={loading}
              options={[{ value: 'headers', label: 'Other clients (custom headers)' }, { value: 'chatgpt', label: 'ChatGPT (OAuth sign-in)' }]}
              onValueChange={value => { setClientMode(value as 'headers' | 'chatgpt'); setError(null); setCopied(null); }} />
          </div>
          {clientMode === 'chatgpt' ? (
            <FormSection.Body>
              <p>Connect ChatGPT with OAuth sign-in. Choose the tools it can use on Gravity’s consent screen.</p>
              {oauthSetupLoading && <p role="status">Loading ChatGPT setup…</p>}
              {oauthSetupError && <>
                <ModalDialog.Feedback type="error">{oauthSetupError}</ModalDialog.Feedback>
                <Button type="button" variant="secondary" onClick={() => setOAuthSetupVersion(value => value + 1)}>Retry setup</Button>
              </>}
              {oauthSetup && oauthSetup.workspaceId === workspaceId && (
                <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                  {[
                    { id: 'chatgpt-name', label: 'Connection name', value: workspaceName ? `Gravity — ${workspaceName}` : 'Gravity' },
                    { id: 'chatgpt-url', label: 'MCP server URL', value: oauthSetup.endpoint },
                    { id: 'chatgpt-auth', label: 'Authentication', value: 'OAuth' },
                    { id: 'chatgpt-transport', label: 'Transport', value: 'Streamable HTTP' },
                  ].map(field => <ConnectionSetupField key={field.id} field={field}
                    copied={copied === field.id} onCopy={() => void handleCopy(field.value, field.id)} />)}
                  <ol style={{ paddingLeft: 'var(--space-lg)', margin: 0 }}>
                    <li>Enable developer mode in ChatGPT if your account allows it, then add an MCP server.</li>
                    <li>Enter the name and server URL above, choose OAuth, and use automatic client registration.</li>
                    <li>Sign in to Gravity and approve the tools ChatGPT can use in this workspace.</li>
                  </ol>
                  <p>No manually generated bearer token, workspace header, client ID, or client secret is needed.</p>
                </div>
              )}
              <p>ChatGPT must reach this server over public HTTPS or a configured Secure MCP Tunnel.{' '}
                <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">ChatGPT setup guide</a>
              </p>
            </FormSection.Body>
          ) : <>
          {catalog.error && <ModalDialog.Feedback type="error">{catalog.error}</ModalDialog.Feedback>}
          {catalog.loading && <p role="status">Loading available tools…</p>}
          <p>These credentials are for clients that accept custom headers. For ChatGPT, choose OAuth sign-in above.</p>
          <div onKeyDown={event => {
            if (event.key === 'Escape' && event.defaultPrevented) event.stopPropagation();
          }}>
            <Select
              label="Connection lifetime"
              value={String(ttlSeconds)}
              options={connectionLifetimeOptions}
              onValueChange={value => setTtlSeconds(Number(value))}
              disabled={loading}
            />
          </div>
          <p>Connections can be reused until they expire or are revoked.</p>
          <fieldset disabled={loading || catalog.loading} style={{ border: 0, padding: 0 }}>
            <legend>Allowed tools</legend>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <Button type="button" variant="secondary" onClick={() => setSelectedTools(allowedTools.filter(tool => tool.annotations?.readOnlyHint === true).map(tool => tool.name))}>Read only</Button>
              <Button type="button" variant="secondary" onClick={() => setSelectedTools(allowedTools.map(tool => tool.name))}>Select All</Button>
              <Button type="button" variant="secondary" onClick={() => setSelectedTools([])}>Clear selection</Button>
            </div>
            {catalog.tools.some(tool => tool.allowedForConnection === false) && <p>Your role or workspace settings restrict some tools.</p>}
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {catalog.tools.map(tool => (
                <label key={tool.name} style={{ display: 'block', marginBottom: 'var(--space-sm)' }} title={tool.description}>
                  <input type="checkbox" checked={selectedTools.includes(tool.name)} disabled={tool.allowedForConnection === false}
                    onChange={event => setSelectedTools(names => event.target.checked ? [...names, tool.name] : names.filter(name => name !== tool.name))} />
                  {' '}{mcpToolLabel(tool.name)} ({tool.annotations?.readOnlyHint === true ? 'read' : tool.annotations?.destructiveHint ? 'delete' : 'write'})
                </label>
              ))}
            </div>
          </fieldset>
          {result && (
            <FormSection.Body>
              <div ref={generatedConnectionRef}>
                {showGeneratedSuccess ? (
                  <ModalDialog.Feedback type="success">
                    Connection generated successfully. Copy or download the configuration to connect your AI client.
                  </ModalDialog.Feedback>
                ) : <p>Previously generated connection configuration.</p>}
              </div>
              <p>Expires {new Date(result.auth.expiresAt).toLocaleString()}. Save this configuration before closing; it contains your connection credential.</p>
              <Tabs key={result.id} defaultTab={`${setupId}-fields`} items={[
                { id: `${setupId}-fields`, label: 'Fields', content: (
                  <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    <p>Use the server URL and both headers below. If your client asks for a bearer token separately, use the token field.</p>
                    {buildMcpConnectionFields(result).map(field => <ConnectionSetupField key={field.id} field={field}
                      copied={copied === field.id} onCopy={() => void handleCopy(field.value, field.id)} />)}
                  </div>
                ) },
                { id: `${setupId}-json`, label: 'JSON', content: (
                  <FormSection.Field label="Client configuration">
                    <textarea aria-label="Client configuration" readOnly value={configText} spellCheck={false} style={{ width: '100%', minHeight: 190 }} />
                  </FormSection.Field>
                ) },
              ]} />
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <Button type="button" variant="secondary" onClick={() => void handleCopy()}>{copied === 'json' ? 'Copied configuration' : 'Copy configuration'}</Button>
                <Button type="button" variant="secondary" onClick={handleDownload}>Download configuration</Button>
              </div>
            </FormSection.Body>
          )}
          </>}
          {showConnections && <FormSection.Body>
            <h3>Connections</h3>
            {connectionsLoading && <p role="status">Loading connections…</p>}
            {!connectionsLoading && connections.length === 0 && <p>No connections yet.</p>}
            {connections.map(connection => {
              const revoked = connection.status === 'revoked' || Boolean(connection.revokedAt);
              const expired = Boolean(connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now());
              return (
                <div key={connection.id} style={{ paddingBlock: 'var(--space-sm)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <p>{connection.id} · {revoked ? 'Revoked' : expired ? 'Expired' : connection.status}</p>
                  {connection.expiresAt && <p>Expires {new Date(connection.expiresAt).toLocaleString()}</p>}
                  <details><summary>Permissions</summary><ul>{connection.scopes.map(scope => <li key={scope}>{scope.replace('tools/call:', '').replace('tools/list', 'Discover tools')}</li>)}</ul></details>
                  {!revoked && !expired && <Button type="button" variant="secondary" disabled={revokingId !== null} onClick={() => void handleRevoke(connection.id)} aria-label={`Revoke connection ${connection.id}`}>{revokingId === connection.id ? 'Revoking…' : 'Revoke'}</Button>}
                </div>
              );
            })}
          </FormSection.Body>}
        </FormSection.Root>
      </ModalDialog.Body>
      <ModalDialog.Footer>
        <ModalDialog.Actions>
          <Button type="button" variant="secondary" onClick={handleClose}>Close</Button>
          {clientMode === 'headers' && <Button type="button" variant="primary" onClick={handleCreate} loading={loading} disabled={loading || catalog.loading || Boolean(catalog.error) || !workspaceId || selectedTools.length === 0}>
            {loading ? 'Generating…' : 'Generate connection'}
          </Button>}
        </ModalDialog.Actions>
      </ModalDialog.Footer>
    </ModalDialog.Root>
  );
}

export default WorkspaceMcpModal;
