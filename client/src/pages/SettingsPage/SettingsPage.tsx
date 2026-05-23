import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Globe, Link2, Mail, Settings2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import {
  Button,
  TextInput,
  Select,
  Grid,
  Stack,
  Flex,
  Card,
  Badge,
  Alert,
  Divider,
  Avatar,
  Switch
} from '@library';
import type { User } from '../../context/TicketContext';
import type { WorkspaceSummary } from '../../hooks/useWorkspaceDirectory';
import type {
  CreateWorkspaceInviteInput,
  FederationConnection,
  WorkspaceAdminSettings,
  WorkspaceInvite,
  WorkspaceJoinRequest,
  WorkspaceMember,
} from '../../hooks/useWorkspaceSettings';

type SettingsCategoryId = 'overview' | 'access' | 'members' | 'requests' | 'mcp_tools';

interface SettingsPageProps {
  currentUser: User;
  workspace: WorkspaceSummary;
  settings: WorkspaceAdminSettings;
  settingsLoading: boolean;
  saveLoading: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  inviteError: string | null;
  federationConnections: FederationConnection[];
  connectionsLoading: boolean;
  connectionsError: string | null;
  retryingConnectionId: string | null;
  invitesLoading: boolean;
  inviteLoading: boolean;
  invites: WorkspaceInvite[];
  members: WorkspaceMember[];
  joinRequests: WorkspaceJoinRequest[];
  approveLoadingId: string | null;
  revokeLoadingId: string | null;
  onBackToWorkspace: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceAdminSettings>) => void;
  onSaveSettings: () => void;
  onCreateInvite: (input: CreateWorkspaceInviteInput) => Promise<boolean>;
  onRevokeInvite: (inviteId: string) => Promise<boolean>;
  onApproveJoinRequest: (requestId: string) => Promise<boolean>;
  onRetryConnection: (connectionId: string) => Promise<void>;
  deleteLoading?: boolean;
  deleteError?: string | null;
  onDeleteWorkspace?: () => Promise<void>;
  onClearDeleteError?: () => void;
}

const COPY_FEEDBACK_STORAGE_KEY = 'gravity_peer_invite_copy_feedback';
const COPY_FEEDBACK_DURATION_MS = 2200;

function getInviteStateLabel(invite: WorkspaceInvite) {
  if (invite.revokedAt) return 'Revoked';
  if (invite.isUsed) return 'Validated';
  return 'Pending';
}

function getInviteStateVariant(invite: WorkspaceInvite): 'accent' | 'success' | 'error' | 'warning' | 'default' {
  if (invite.revokedAt) return 'error';
  if (invite.isUsed) return 'success';
  return 'accent';
}

const SETTINGS_CATEGORIES: Array<{
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Workspace identity, host location, and join policy.',
    icon: Settings2,
  },
  {
    id: 'mcp_tools',
    label: 'MCP Tools',
    description: 'Enable or disable AI agent tools for this workspace.',
    icon: ShieldCheck,
  },
  {
    id: 'access',
    label: 'Invites',
    description: 'Create invite links and review access entry points.',
    icon: Link2,
  },
  {
    id: 'members',
    label: 'Members',
    description: 'Inspect the people who already belong to this workspace.',
    icon: Users,
  },
  {
    id: 'requests',
    label: 'Join Requests',
    description: 'Approve or review pending access requests.',
    icon: UserPlus,
  },
];

function formatConnectionTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not yet recorded';
}

function getFederationConnectionStatus(connection: FederationConnection) {
  if (connection.status === 'failed') {
    return { label: 'Failed', variant: 'error' as const };
  }

  if (connection.syncState.consecutiveFailures > 0) {
    return { label: 'Retrying', variant: 'warning' as const };
  }

  if (connection.lastSyncedEventId > 0) {
    return { label: 'Synced', variant: 'success' as const };
  }

  return { label: 'Connected', variant: 'accent' as const };
}

function OverviewSection({
  workspace,
  settings,
  onChangeSettings,
}: {
  workspace: WorkspaceSummary;
  settings: WorkspaceAdminSettings;
  onChangeSettings: (updates: Partial<WorkspaceAdminSettings>) => void;
}) {
  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Host Configuration</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Manage the remote configuration and identity of this workspace. These controls govern peer networking, host routing, and invitation schemes.
          </p>
        </div>

        <Grid columns={2} gap="var(--space-4)">
          <TextInput label="Workspace Name" value={workspace.name} disabled />
          <TextInput label="Workspace Key" value={workspace.key} disabled />
        </Grid>

        <TextInput
          label="Host URL"
          value={settings.hostUrl}
          placeholder="http://localhost:5000"
          onChange={(event) => onChangeSettings({ hostUrl: event.target.value })}
        />

        <Grid columns={2} gap="var(--space-4)">
          <Select
            label="Join Policy"
            value={settings.joinMode}
            onChange={(event) => onChangeSettings({ joinMode: event.target.value as WorkspaceAdminSettings['joinMode'] })}
            options={[
              { value: 'approval_required', label: 'Owner Approval Required' },
              { value: 'auto_join', label: 'Auto Join' }
            ]}
          />

          <TextInput
            label="Private Workspace Access Key"
            value={settings.workspaceKey}
            onChange={(event) => onChangeSettings({ workspaceKey: event.target.value.toUpperCase() })}
          />
        </Grid>

        <Divider />

        <Grid columns={3} gap="var(--space-3)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
            <Globe size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Projects</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)', marginTop: '2px' }}>{workspace.projectCount} child projects</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
            <Users size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Members</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)', marginTop: '2px' }}>{workspace.memberCount} approved users</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
            <UserPlus size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Pending Reviews</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)', marginTop: '2px' }}>{workspace.pendingJoinRequestCount} requests</div>
            </div>
          </div>
        </Grid>
      </Stack>
    </Card>
  );
}

function DangerZoneSection({
  workspace,
  deleteLoading,
  deleteError,
  onDeleteWorkspace,
  onClearDeleteError,
}: {
  workspace: WorkspaceSummary;
  deleteLoading?: boolean;
  deleteError?: string | null;
  onDeleteWorkspace?: () => Promise<void>;
  onClearDeleteError?: () => void;
}) {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#FFF' }}>Danger Zone</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Deleting a workspace is permanent and cannot be undone. All projects, tickets, comments, and members within this workspace will be deleted.
          </p>
        </div>
        
        {deleteError && (
          <Alert type="error">
            {deleteError}
          </Alert>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <TextInput
              label={`Type "${workspace.name}" to confirm`}
              value={deleteConfirmation}
              onChange={(e) => {
                setDeleteConfirmation(e.target.value);
                if (deleteError && onClearDeleteError) {
                  onClearDeleteError();
                }
              }}
            />
          </div>
          <Button
            variant="danger"
            disabled={!onDeleteWorkspace || deleteConfirmation !== workspace.name || deleteLoading}
            loading={deleteLoading}
            onClick={() => onDeleteWorkspace?.()}
          >
            Delete Workspace
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

function FederationConnectionsSection({
  federationConnections,
  connectionsLoading,
  connectionsError,
  retryingConnectionId,
  onRetryConnection,
}: {
  federationConnections: FederationConnection[];
  connectionsLoading: boolean;
  connectionsError: string | null;
  retryingConnectionId: string | null;
  onRetryConnection: (connectionId: string) => Promise<void>;
}) {
  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Federation Connections</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Review guest-side host links, sync cursors, and retry health for this workspace.
          </p>
        </div>

        {connectionsLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading federation connections...</div>}

        {connectionsError && (
          <Alert type="warning">
            {connectionsError}
          </Alert>
        )}

        {!connectionsLoading && federationConnections.length === 0 && !connectionsError && (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>
            No guest federation connections exist for this workspace yet.
          </div>
        )}

        <Stack gap="var(--space-3)">
          {federationConnections.map((connection) => {
            const status = getFederationConnectionStatus(connection);

            return (
              <div
                key={connection.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--card-hover)',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                      {connection.hostDisplayName || connection.workspaceName || 'Federated Host'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-word' }}>{connection.hostUrl}</div>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <Grid columns={3} gap="var(--space-3)">
                  <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Last Success</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-heading)', lineHeight: 1.4 }}>
                      {formatConnectionTimestamp(connection.syncState.lastSuccessAt)}
                    </div>
                  </div>

                  <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sync Cursor</div>
                    <div style={{ marginTop: '6px', fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>{connection.lastSyncedEventId}</div>
                  </div>

                  <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Retries</div>
                    <div style={{ marginTop: '6px', fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>{connection.syncState.consecutiveFailures}</div>
                  </div>
                </Grid>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span>Last attempt: {formatConnectionTimestamp(connection.syncState.lastAttemptAt)}</span>
                  <span>Created: {formatConnectionTimestamp(connection.createdAt)}</span>
                  {connection.syncState.nextAttemptAt && <span>Next retry: {formatConnectionTimestamp(connection.syncState.nextAttemptAt)}</span>}
                  <span>Applied last sweep: {connection.syncState.lastAppliedCount}</span>
                </div>

                {connection.syncState.lastError && (
                  <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 184, 0, 0.08)', border: '1px solid rgba(255, 184, 0, 0.2)', color: 'var(--text-heading)', fontSize: '12px', lineHeight: 1.5 }}>
                    {connection.syncState.lastError}
                  </div>
                )}

                {(connection.status === 'failed' || connection.syncState.consecutiveFailures > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void onRetryConnection(connection.id)}
                      loading={retryingConnectionId === connection.id}
                      disabled={retryingConnectionId !== null && retryingConnectionId !== connection.id}
                    >
                      {retryingConnectionId === connection.id ? 'Retrying...' : 'Retry Sync'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}

function AccessSection({
  invites,
  invitesLoading,
  inviteLoading,
  revokeLoadingId,
  onCreateInvite,
  onRevokeInvite,
}: {
  invites: WorkspaceInvite[];
  invitesLoading: boolean;
  inviteLoading: boolean;
  revokeLoadingId: string | null;
  onCreateInvite: (input: CreateWorkspaceInviteInput) => Promise<boolean>;
  onRevokeInvite: (inviteId: string) => Promise<boolean>;
}) {
  const latestInvite = invites[0] ?? null;
  const [email, setEmail] = useState('');
  const [expirationHours, setExpirationHours] = useState('24');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const scheduleCopyFeedbackReset = (key: string, expiresAt: number) => {
    window.setTimeout(() => {
      const rawValue = window.sessionStorage.getItem(COPY_FEEDBACK_STORAGE_KEY);
      if (!rawValue) {
        setCopiedField((current) => (current === key ? null : current));
        return;
      }

      try {
        const savedValue = JSON.parse(rawValue) as { key?: string; expiresAt?: number };
        if (savedValue.key !== key || savedValue.expiresAt !== expiresAt) {
          return;
        }
      } catch {
        window.sessionStorage.removeItem(COPY_FEEDBACK_STORAGE_KEY);
      }

      window.sessionStorage.removeItem(COPY_FEEDBACK_STORAGE_KEY);
      setCopiedField((current) => (current === key ? null : current));
    }, Math.max(expiresAt - Date.now(), 0));
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const rawValue = window.sessionStorage.getItem(COPY_FEEDBACK_STORAGE_KEY);
    if (!rawValue) {
      return undefined;
    }

    try {
      const savedValue = JSON.parse(rawValue) as { key?: string; expiresAt?: number };
      if (typeof savedValue.key !== 'string' || typeof savedValue.expiresAt !== 'number') {
        window.sessionStorage.removeItem(COPY_FEEDBACK_STORAGE_KEY);
        return undefined;
      }

      if (savedValue.expiresAt <= Date.now()) {
        window.sessionStorage.removeItem(COPY_FEEDBACK_STORAGE_KEY);
        return undefined;
      }

      setCopiedField(savedValue.key);
      scheduleCopyFeedbackReset(savedValue.key, savedValue.expiresAt);
    } catch {
      window.sessionStorage.removeItem(COPY_FEEDBACK_STORAGE_KEY);
    }

    return undefined;
  }, []);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      const expiresAt = Date.now() + COPY_FEEDBACK_DURATION_MS;
      window.sessionStorage.setItem(COPY_FEEDBACK_STORAGE_KEY, JSON.stringify({ key, expiresAt }));
      scheduleCopyFeedbackReset(key, expiresAt);
    } catch {
      setCopiedField(null);
    }
  };

  const handleCreateInvite = async () => {
    const success = await onCreateInvite({
      email,
      expirationHours: Number(expirationHours) || 24,
    });
    if (success) {
      setEmail('');
      setExpirationHours('24');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    await onRevokeInvite(inviteId);
  };

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Peer Invites</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Mint and issue direct guest credentials linked to remote peers. This configuration provides secure, cryptographically validated workspace entry codes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
          <Mail size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>Host handoff workflow</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
              Generate an invite link, then share the guest validation code, validation URL, and hashing credentials securely through your preferred channel.
            </div>
          </div>
        </div>

        <Grid columns="1.5fr 1fr" gap="var(--space-4)">
          <TextInput
            label="Guest Email"
            value={email}
            placeholder="guest-user@peer.com"
            onChange={(event) => setEmail(event.target.value)}
          />

          <TextInput
            label="Expires In (Hours)"
            type="number"
            min={1}
            value={expirationHours}
            onChange={(event) => setExpirationHours(event.target.value)}
          />
        </Grid>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={() => void handleCreateInvite()} loading={inviteLoading} disabled={!email.trim()}>
            Create Invite
          </Button>
        </div>

        {latestInvite && (
          <Stack gap="var(--space-3)" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'rgba(170, 59, 255, 0.02)', border: '1px solid rgba(170, 59, 255, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Most Recent Invite</span>
                <h4 style={{ margin: '2px 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>{latestInvite.email}</h4>
              </div>
              <Badge variant={getInviteStateVariant(latestInvite)}>
                {getInviteStateLabel(latestInvite)}
              </Badge>
            </div>

            <Grid columns={3} gap="var(--space-3)" style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Invite URL</span>
                <span style={{ fontSize: '11px', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestInvite.inviteUrl}</span>
                <Button variant="default" size="xs" style={{ marginTop: 'auto' }} onClick={() => void handleCopy('invite-url', latestInvite.inviteUrl)}>
                  {copiedField === 'invite-url' ? 'Copied' : 'Copy URL'}
                </Button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Validation Code</span>
                <span style={{ fontSize: '11px', color: 'var(--text-heading)', fontFamily: 'monospace' }}>{latestInvite.validationCode}</span>
                <Button variant="default" size="xs" style={{ marginTop: 'auto' }} onClick={() => void handleCopy('validation-code', latestInvite.validationCode)}>
                  {copiedField === 'validation-code' ? 'Copied' : 'Copy Code'}
                </Button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Workspace Key</span>
                <span style={{ fontSize: '11px', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestInvite.workspacePrivateKey}</span>
                <Button variant="default" size="xs" style={{ marginTop: 'auto' }} onClick={() => void handleCopy('workspace-key', latestInvite.workspacePrivateKey)}>
                  {copiedField === 'workspace-key' ? 'Copied' : 'Copy Key'}
                </Button>
              </div>
            </Grid>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: '11px', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
              <span>Expires {new Date(latestInvite.expiresAt).toLocaleString()}</span>
              {latestInvite.revokedAt && <span>Revoked {new Date(latestInvite.revokedAt).toLocaleString()}</span>}
              <span>{latestInvite.guestUsername ? `Validated by ${latestInvite.guestUsername}` : 'Awaiting peer validation'}</span>
            </div>

            {!latestInvite.revokedAt && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleRevokeInvite(latestInvite.id)}
                  disabled={revokeLoadingId === latestInvite.id}
                >
                  {revokeLoadingId === latestInvite.id ? 'Revoking...' : latestInvite.isUsed ? 'Revoke Access' : 'Revoke Invite'}
                </Button>
              </div>
            )}
          </Stack>
        )}

        {invitesLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>Loading peer invites...</div>}
        {!invitesLoading && invites.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>No peer invites exist yet for this workspace.</div>}

        {invites.length > 0 && (
          <Stack gap="var(--space-3)" style={{ marginTop: 'var(--space-2)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Historical Invites ({invites.length})</span>
            {invites.map((invite) => (
              <div
                key={invite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--card-hover)',
                  border: '1px solid var(--border)'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{invite.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                    <span>Code: {invite.validationCode}</span>
                    <span>Expires: {new Date(invite.expiresAt).toLocaleDateString()}</span>
                    {invite.guestUsername && <span>Guest: {invite.guestUsername}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <Badge variant={getInviteStateVariant(invite)}>
                    {getInviteStateLabel(invite)}
                  </Badge>
                  <Button variant="default" size="xs" onClick={() => void handleCopy(`invite-row-${invite.id}`, invite.inviteUrl)}>
                    {copiedField === `invite-row-${invite.id}` ? 'Copied' : 'Copy'}
                  </Button>
                  {!invite.revokedAt && (
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => void handleRevokeInvite(invite.id)}
                      disabled={revokeLoadingId === invite.id}
                    >
                      {revokeLoadingId === invite.id ? 'Revoking...' : invite.isUsed ? 'Revoke' : 'Cancel'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function formatLastActive(isoString?: string | null): string {
  if (!isoString) {
    return 'Never';
  }

  try {
    const activeDate = new Date(isoString);
    if (isNaN(activeDate.getTime())) {
      return 'Never';
    }

    const today = new Date();
    const isSameDay =
      activeDate.getDate() === today.getDate() &&
      activeDate.getMonth() === today.getMonth() &&
      activeDate.getFullYear() === today.getFullYear();

    if (isSameDay) {
      return 'Today';
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      activeDate.getDate() === yesterday.getDate() &&
      activeDate.getMonth() === yesterday.getMonth() &&
      activeDate.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Yesterday';
    }

    return activeDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Never';
  }
}

function MembersSection({ members }: { members: WorkspaceMember[] }) {
  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Approved Members</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Membership controls the access boundary. Users listed here are fully approved to access project tasks and collaborate inside this workspace.
          </p>
        </div>

        {members.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>No members are assigned to this workspace yet.</div>}

        <Stack gap="var(--space-3)">
          {members.map((member) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--card-hover)',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Avatar src={member.avatar} name={member.name} size="md" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{member.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{member.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                    Last active: {formatLastActive(member.lastActiveAt)}
                  </div>
                </div>
              </div>

              <Badge variant={member.role === 'owner' ? 'accent' : 'default'}>
                {member.role}
              </Badge>
            </div>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function RequestsSection({
  joinRequests,
  approveLoadingId,
  onApproveJoinRequest,
}: {
  joinRequests: WorkspaceJoinRequest[];
  approveLoadingId: string | null;
  onApproveJoinRequest: (requestId: string) => Promise<boolean>;
}) {
  const pendingRequests = useMemo(
    () => joinRequests.filter((request) => request.status === 'pending'),
    [joinRequests]
  );

  const reviewedRequests = useMemo(
    () => joinRequests.filter((request) => request.status !== 'pending'),
    [joinRequests]
  );

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>Join Requests</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Manage pending inbound workspace access requests. Requests will remain in a pending state until reviewed and approved by an owner.
          </p>
        </div>

        {pendingRequests.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>No pending join requests at the moment.</div>}

        <Stack gap="var(--space-3)">
          {pendingRequests.map((request) => (
            <div
              key={request.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--card-hover)',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--accent-glow)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700 }}>
                  {request.requesterName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{request.requesterName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{request.requesterEmail}</div>
                  {request.message && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-heading)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', fontStyle: 'italic' }}>
                      "{request.message}"
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => void onApproveJoinRequest(request.id)}
                disabled={approveLoadingId === request.id}
              >
                {approveLoadingId === request.id ? 'Approving...' : 'Approve'}
              </Button>
            </div>
          ))}
        </Stack>

        {reviewedRequests.length > 0 && (
          <Stack gap="var(--space-3)" style={{ marginTop: 'var(--space-4)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Recently Reviewed</span>
            {reviewedRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--card-hover)',
                  border: '1px solid var(--border)',
                  opacity: 0.75
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{request.requesterName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {request.status} · Approved by {request.reviewedByName || 'Unknown owner'}
                  </div>
                </div>

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(request.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

interface McpToolMetadata {
  name: string;
  label: string;
  description: string;
}

const MCP_TOOL_GROUPS: { title: string; tools: McpToolMetadata[] }[] = [
  {
    title: 'Ticket Tools',
    tools: [
      {
        name: 'list_tickets',
        label: 'List Tickets',
        description: 'Allows reading the list of tasks and tickets in the workspace, with optional status or project filters.',
      },
      {
        name: 'get_ticket_details',
        label: 'Get Ticket Details',
        description: 'Allows reading complete details, description, and status of any ticket via its unique key.',
      },
      {
        name: 'create_ticket',
        label: 'Create Ticket',
        description: 'Allows creating new tickets and sub-tasks under existing tickets in the workspace.',
      },
      {
        name: 'update_ticket',
        label: 'Update Ticket',
        description: 'Allows updating description, title, priority, cycle, domain, and status of existing tickets.',
      },
    ],
  },
  {
    title: 'Member Tools',
    tools: [
      {
        name: 'list_workspace_members',
        label: 'List Workspace Members',
        description: 'Allows reading the list of members in this workspace, including their roles and active times.',
      },
    ],
  },
  {
    title: 'Comment Tools',
    tools: [
      {
        name: 'create_comment',
        label: 'Create Comment',
        description: 'Allows creating new comments on an existing ticket.',
      },
      {
        name: 'read_comments',
        label: 'Read Comments',
        description: 'Allows reading all comment threads on a specific ticket.',
      },
      {
        name: 'update_comment',
        label: 'Update Comment',
        description: 'Allows updating the text body of a specific comment on a ticket.',
      },
      {
        name: 'delete_comment',
        label: 'Delete Comment',
        description: 'Allows deleting a specific comment on a ticket.',
      },
    ],
  },
];

function McpToolsSection({
  workspace,
  settings,
  onChangeSettings,
}: {
  workspace: WorkspaceSummary;
  settings: WorkspaceAdminSettings;
  onChangeSettings: (updates: Partial<WorkspaceAdminSettings>) => void;
}) {
  const isOwner = workspace.memberRole === 'owner';
  const disabledTools = settings.disabledMcpTools || [];

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>MCP Agent Tools</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Configure which model-context-protocol (MCP) tools AI assistants are allowed to use within this workspace. Disabling tools prevents any AI assistant or agent from calling them on behalf of users.
          </p>
        </div>

        {!isOwner && (
          <Alert type="info">
            Only workspace owners can enable or disable MCP agent tools.
          </Alert>
        )}

        <Stack gap="var(--space-6)">
          {MCP_TOOL_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 style={{ margin: '0 0 var(--space-4) 0', fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
                {group.title}
              </h3>
              <Stack gap="var(--space-3)">
                {group.tools.map((tool) => {
                  const isEnabled = !disabledTools.includes(tool.name);

                  const handleToggle = (checked: boolean) => {
                    let nextDisabled = [...disabledTools];
                    if (checked) {
                      nextDisabled = nextDisabled.filter((name) => name !== tool.name);
                    } else {
                      if (!nextDisabled.includes(tool.name)) {
                        nextDisabled.push(tool.name);
                      }
                    }
                    onChangeSettings({ disabledMcpTools: nextDisabled });
                  };

                  return (
                    <div
                      key={tool.name}
                      data-testid={`mcp-tool-row-${tool.name}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-4)',
                        padding: 'var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--card-hover)',
                        border: '1px solid var(--border)',
                        transition: 'border-color 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: isEnabled ? 'var(--success)' : 'var(--error)',
                              boxShadow: isEnabled
                                ? '0 0 8px var(--success-glow)'
                                : '0 0 8px var(--error-glow)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                            {tool.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, paddingLeft: 'calc(8px + var(--space-3))' }}>
                          {tool.description}
                        </span>
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        <Switch
                          label={isEnabled ? 'Enabled' : 'Disabled'}
                          checked={isEnabled}
                          onCheckedChange={handleToggle}
                          disabled={!isOwner}
                        />
                      </div>
                    </div>
                  );
                })}
              </Stack>
            </div>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

export function SettingsPage({
  currentUser,
  workspace,
  settings,
  settingsLoading,
  saveLoading,
  saveSuccess,
  saveError,
  inviteError,
  federationConnections,
  connectionsLoading,
  connectionsError,
  retryingConnectionId,
  invitesLoading,
  inviteLoading,
  invites,
  members,
  joinRequests,
  approveLoadingId,
  revokeLoadingId,
  onBackToWorkspace,
  onOpenDirectory,
  onChangeSettings,
  onSaveSettings,
  onCreateInvite,
  onRevokeInvite,
  onApproveJoinRequest,
  onRetryConnection,
  deleteLoading,
  deleteError,
  onDeleteWorkspace,
  onClearDeleteError,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('overview');

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top Header Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--card-bg)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <Flex align="center" gap="var(--space-4)">
          <Button variant="ghost" size="sm" onClick={onBackToWorkspace} leftIcon={<ArrowLeft size={14} />}>
            Workspace
          </Button>

          <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
            Workspaces
          </Button>

          <Divider vertical style={{ height: '20px' }} />

          <div>
            <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>Workspace Settings</h1>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>Managing {workspace.name}</p>
          </div>
        </Flex>

        <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading}>
          {saveSuccess ? 'Changes Saved' : 'Save Changes'}
        </Button>
      </header>

      {/* Main Body Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', flexGrow: 1 }}>
        {/* Left Sidebar Menu */}
        <aside
          style={{
            borderRight: '1px solid var(--border)',
            backgroundColor: 'var(--sidebar-bg)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
            <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{currentUser.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Managing {workspace.key}</div>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {SETTINGS_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    border: '1px solid transparent',
                    borderRadius: 'var(--radius-md)',
                    background: isActive ? 'var(--card-bg)' : 'transparent',
                    borderColor: isActive ? 'var(--border)' : 'transparent',
                    cursor: 'pointer',
                    color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)'
                  }}
                  className="clickable lib-focus-ring"
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{category.label}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.2 }}>{category.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Content Pane */}
        <section style={{ padding: 'var(--space-6)', overflowY: 'auto', maxHeight: 'calc(100vh - 64px)' }}>
          <Stack gap="var(--space-5)" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Settings Section
              </span>
              <h2 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                {activeCategoryMeta.label}
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {activeCategoryMeta.description}
              </p>
            </div>

            {settingsLoading && (
              <Alert type="info">
                Loading workspace administration data...
              </Alert>
            )}

            {saveError && (
              <Alert type="error">
                {saveError}
              </Alert>
            )}

            {inviteError && (
              <Alert type="error">
                {inviteError}
              </Alert>
            )}

            {activeCategory === 'overview' && (
              <>
                <OverviewSection
                  workspace={workspace}
                  settings={settings}
                  onChangeSettings={onChangeSettings}
                />
                <FederationConnectionsSection
                  federationConnections={federationConnections}
                  connectionsLoading={connectionsLoading}
                  connectionsError={connectionsError}
                  retryingConnectionId={retryingConnectionId}
                  onRetryConnection={onRetryConnection}
                />
                <DangerZoneSection
                  workspace={workspace}
                  deleteLoading={deleteLoading}
                  deleteError={deleteError}
                  onDeleteWorkspace={onDeleteWorkspace}
                  onClearDeleteError={onClearDeleteError}
                />
              </>
            )}

            {activeCategory === 'access' && (
              <AccessSection
                invites={invites}
                invitesLoading={invitesLoading}
                inviteLoading={inviteLoading}
                revokeLoadingId={revokeLoadingId}
                onCreateInvite={onCreateInvite}
                onRevokeInvite={onRevokeInvite}
              />
            )}

            {activeCategory === 'members' && <MembersSection members={members} />}

            {activeCategory === 'requests' && (
              <RequestsSection
                joinRequests={joinRequests}
                approveLoadingId={approveLoadingId}
                onApproveJoinRequest={onApproveJoinRequest}
              />
            )}

            {activeCategory === 'mcp_tools' && (
              <McpToolsSection
                workspace={workspace}
                settings={settings}
                onChangeSettings={onChangeSettings}
              />
            )}
          </Stack>
        </section>
      </div>
    </div>
  );
}

