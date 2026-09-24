import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Select, Stack } from '@library';
import { Plus, RefreshCw } from 'lucide-react';
import type { User } from '../../../../types/domain';
import { WorkspaceMcpModal } from '../../../workspaces/components/WorkspaceMcpModal';
import { mcpToolLabel } from '../../../../utils/mcp';
import {
  accountConnectionError,
  revokeAccountMcpConnection,
  useAccountMcpConnections,
  type AccountMcpConnection,
} from '../../hooks/useAccountMcpConnections';

function connectionStatus(connection: AccountMcpConnection) {
  if (connection.revokedAt || connection.status === 'revoked') return 'Revoked';
  if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now()) return 'Expired';
  return connection.status === 'active' ? 'Active' : mcpToolLabel(connection.status);
}

export function ExternalAiSection({ currentUser }: { currentUser: User }) {
  const { connections, workspaces, loading, error, refresh } = useAccountMcpConnections();
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [connectingWorkspace, setConnectingWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const effectiveFilter = workspaces.some(workspace => workspace.id === workspaceFilter) ? workspaceFilter : 'all';
  const visibleWorkspaces = workspaces.filter(workspace => effectiveFilter === 'all' || workspace.id === effectiveFilter);

  async function revoke(connection: AccountMcpConnection) {
    setRevokingId(connection.id);
    setActionError(null);
    setNotice(null);
    try {
      await revokeAccountMcpConnection(connection);
      if (!mounted.current) return;
      setNotice(`Connection revoked for ${connection.workspaceName}.`);
      await refresh();
    } catch (revokeError) {
      if (mounted.current) setActionError(accountConnectionError(revokeError));
    } finally {
      if (mounted.current) setRevokingId(null);
    }
  }

  return (
    <Stack gap="var(--space-md)">
      <Card className="account-preferences-page__section-card">
        <Stack gap="var(--space-md)">
          <div>
            <h2 className="account-preferences-page__section-title">Your AI connections</h2>
            <p className="account-preferences-page__section-description">
              Connect external AI clients to your workspaces. Each connection has its own permissions and expiry.
              Only connections created by your account are shown here.
            </p>
          </div>
          <div className="account-preferences-page__connection-toolbar">
            <Select
              label="Workspace"
              value={effectiveFilter}
              onValueChange={setWorkspaceFilter}
              options={[
                { value: 'all', label: 'All workspaces' },
                ...workspaces.map(workspace => ({ value: workspace.id, label: workspace.name })),
              ]}
            />
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading} leftIcon={<RefreshCw size={14} />}>
              Refresh connections
            </Button>
          </div>
          <p className="account-preferences-page__section-description">
            Connection changes take effect immediately. Credentials are shown only when generated; create a new connection if you no longer have them.
          </p>
        </Stack>
      </Card>

      {loading && <p role="status">Loading your connections…</p>}
      {error && <Alert type="error">{error}</Alert>}
      {actionError && <Alert type="error">{actionError}</Alert>}
      {notice && <div role="status"><Alert type="success">{notice}</Alert></div>}
      {!loading && !error && workspaces.length === 0 && (
        <Alert type="info">Join or create a workspace to connect an external AI client.</Alert>
      )}

      {visibleWorkspaces.map(workspace => {
        const workspaceConnections = connections.filter(connection => connection.workspaceId === workspace.id && connection.generatedBy === currentUser.id);
        return (
          <Card key={workspace.id} className="account-preferences-page__section-card">
            <section aria-label={`${workspace.name} connections`}>
              <Stack gap="var(--space-md)">
                <div className="account-preferences-page__connection-heading">
                  <div>
                    <h3 className="account-preferences-page__section-subtitle">{workspace.name}</h3>
                    <p className="account-preferences-page__section-description">
                      {workspace.key} · {workspaceConnections.length} {workspaceConnections.length === 1 ? 'connection' : 'connections'}
                    </p>
                  </div>
                  <Button variant="default" size="sm" disabled={loading} leftIcon={<Plus size={14} />} onClick={() => setConnectingWorkspace(workspace)}>
                    New connection
                  </Button>
                </div>
                {workspaceConnections.length === 0 && <p className="account-preferences-page__section-description">No connections in this workspace yet.</p>}
                {workspaceConnections.map(connection => {
                  const status = connectionStatus(connection);
                  return (
                    <div key={connection.id} className="account-preferences-page__saved-key-item">
                      <div className="account-preferences-page__connection-heading">
                        <div className="account-preferences-page__connection-details">
                          <span className="account-preferences-page__saved-key-title">{connection.clientName || 'Connection'} {connection.id.slice(0, 8)}</span>
                          <p className="account-preferences-page__section-description">
                            <span className={status === 'Active' ? 'account-preferences-page__saved-key-state--active' : ''}>{status}</span>
                            {connection.expiresAt && <> · {status === 'Expired' ? 'Expired' : 'Expires'} {new Date(connection.expiresAt).toLocaleString()}</>}
                          </p>
                          <p className="account-preferences-page__section-description">
                            {connection.connectionType === 'oauth' ? 'OAuth sign-in' : 'Custom headers'}
                            {connection.createdAt && <> · Created {new Date(connection.createdAt).toLocaleString()}</>}
                          </p>
                        </div>
                        {status === 'Active' && (
                          <Button variant="ghost" size="sm" disabled={revokingId !== null || loading} loading={revokingId === connection.id} onClick={() => void revoke(connection)}>
                            Revoke
                          </Button>
                        )}
                      </div>
                      <details>
                        <summary>Permissions ({connection.scopes.filter(scope => scope !== 'tools/list').length})</summary>
                        <ul className="account-preferences-page__connection-scopes">
                          {connection.scopes.map(scope => <li key={scope}>{scope === 'tools/list' ? 'List available tools' : mcpToolLabel(scope.replace(/^tools\/call:/, ''))}</li>)}
                        </ul>
                      </details>
                    </div>
                  );
                })}
              </Stack>
            </section>
          </Card>
        );
      })}

      {connectingWorkspace && <WorkspaceMcpModal
        key={connectingWorkspace.id}
        workspaceId={connectingWorkspace.id}
        workspaceName={connectingWorkspace.name}
        isOpen
        onClose={() => {
          setConnectingWorkspace(null);
          void refresh();
        }}
        showConnections={false}
        onConnectionsChanged={refresh}
      />}
    </Stack>
  );
}
