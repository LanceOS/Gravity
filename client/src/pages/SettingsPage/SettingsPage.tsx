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
import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import type { User } from '../../context/TicketContext';
import type { WorkspaceSummary } from '../../hooks/useWorkspaceDirectory';
import type {
  CreateWorkspaceInviteInput,
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
  deleteLoading?: boolean;
  deleteError?: string | null;
  onDeleteWorkspace?: () => Promise<void>;
  onClearDeleteError?: () => void;
}

const COPY_FEEDBACK_STORAGE_KEY = 'gravity_peer_invite_copy_feedback';
const COPY_FEEDBACK_DURATION_MS = 2200;

function getInviteStateLabel(invite: WorkspaceInvite) {
  if (invite.revokedAt) return 'Revoked';
  if (invite.revokedAt) return 'Revoked';
  return 'Active';
}

function getInviteStateVariant(invite: WorkspaceInvite): 'accent' | 'success' | 'error' | 'warning' | 'default' {
  if (invite.revokedAt) return 'error';
  return 'success';
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Host Configuration</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
            <Globe size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>Projects</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>{workspace.projectCount} child projects</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
            <Users size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>Members</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>{workspace.memberCount} approved users</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
            <UserPlus size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>Pending Reviews</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>{workspace.pendingJoinRequestCount} requests</div>
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
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
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
  const [label, setLabel] = useState('');
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
      label,
    });
    if (success) {
      setLabel('');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    await onRevokeInvite(inviteId);
  };

  const getInviteLink = (code: string) => {
    return `${window.location.origin}/?invite=${code}`;
  };

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Workspace Invites</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Create secure, shareable invitation links for users to request access or join this workspace.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
          <Mail size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Invitation Link Process</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', marginTop: '4px', lineHeight: 1.5 }}>
              Share the invitation URL. Visited guest users can immediately send a join request, which you can approve in the "Join Requests" tab.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <TextInput
              label="Invite Label"
              value={label}
              placeholder="e.g. Engineering Team, External Audit"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button variant="primary" onClick={() => void handleCreateInvite()} loading={inviteLoading} disabled={!label.trim()}>
            Create Invite
          </Button>
        </div>

        {latestInvite && (
          <Stack gap="var(--space-3)" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'rgba(170, 59, 255, 0.02)', border: '1px solid rgba(170, 59, 255, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>Most Recent Invite</span>
                <h4 style={{ margin: '2px 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{latestInvite.label || 'No Label'}</h4>
              </div>
              <Badge variant={getInviteStateVariant(latestInvite)}>
                {getInviteStateLabel(latestInvite)}
              </Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>Invite URL</span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getInviteLink(latestInvite.code)}</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                <Button variant="default" size="xs" onClick={() => void handleCopy('invite-url', getInviteLink(latestInvite.code))}>
                  {copiedField === 'invite-url' ? 'Copied URL' : 'Copy Invite URL'}
                </Button>
                <Button variant="default" size="xs" onClick={() => void handleCopy('invite-code', latestInvite.code)}>
                  {copiedField === 'invite-code' ? 'Copied Code' : 'Copy Code Only'}
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: 'var(--space-1)' }}>
              <span>Created by {latestInvite.createdByName}</span>
              <span>Used {latestInvite.useCount} times</span>
              {latestInvite.revokedAt && <span>Revoked {new Date(latestInvite.revokedAt).toLocaleString()}</span>}
            </div>

            {!latestInvite.revokedAt && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleRevokeInvite(latestInvite.id)}
                  disabled={revokeLoadingId === latestInvite.id}
                >
                  {revokeLoadingId === latestInvite.id ? 'Revoking...' : 'Revoke Invite'}
                </Button>
              </div>
            )}
          </Stack>
        )}

        {invitesLoading && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>Loading invites...</div>}
        {!invitesLoading && invites.length === 0 && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>No invites exist yet for this workspace.</div>}

        {invites.length > 0 && (
          <Stack gap="var(--space-3)" style={{ marginTop: 'var(--space-2)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>Historical Invites ({invites.length})</span>
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
                  background: 'var(--color-base100)',
                  border: '1px solid var(--color-border-default)'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{invite.label || 'No Label'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                    <span>Code: {invite.code}</span>
                    <span>Used: {invite.useCount}</span>
                    <span>Created by: {invite.createdByName}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <Badge variant={getInviteStateVariant(invite)}>
                    {getInviteStateLabel(invite)}
                  </Badge>
                  <Button variant="default" size="xs" onClick={() => void handleCopy(`invite-row-${invite.id}`, getInviteLink(invite.code))}>
                    {copiedField === `invite-row-${invite.id}` ? 'Copied' : 'Copy Link'}
                  </Button>
                  {!invite.revokedAt && (
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => void handleRevokeInvite(invite.id)}
                      disabled={revokeLoadingId === invite.id}
                    >
                      {revokeLoadingId === invite.id ? 'Revoking...' : 'Revoke'}
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Approved Members</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Membership controls the access boundary. Users listed here are fully approved to access project tasks and collaborate inside this workspace.
          </p>
        </div>

        {members.length === 0 && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>No members are assigned to this workspace yet.</div>}

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
                background: 'var(--color-base100)',
                border: '1px solid var(--color-border-default)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Avatar src={member.avatar} name={member.name} size="md" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{member.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', marginTop: '2px' }}>{member.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: '4px', fontStyle: 'italic' }}>
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Join Requests</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Manage pending inbound workspace access requests. Requests will remain in a pending state until reviewed and approved by an owner.
          </p>
        </div>

        {pendingRequests.length === 0 && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-4)' }}>No pending join requests at the moment.</div>}

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
                background: 'var(--color-base100)',
                border: '1px solid var(--color-border-default)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-state-selected-bg)', border: '1px solid var(--color-border-focus)', color: 'var(--color-primary)', fontWeight: 700 }}>
                  {request.requesterName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{request.requesterName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', marginTop: '2px' }}>{request.requesterEmail}</div>
                  {request.message && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-primary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-app)', border: '1px solid var(--color-border-default)', fontStyle: 'italic' }}>
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
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>Recently Reviewed</span>
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
                  background: 'var(--color-base100)',
                  border: '1px solid var(--color-border-default)',
                  opacity: 0.75
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{request.requesterName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: '2px' }}>
                    {request.status} · Approved by {request.reviewedByName || 'Unknown owner'}
                  </div>
                </div>

                <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>{new Date(request.createdAt).toLocaleDateString()}</span>
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
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>MCP Agent Tools</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
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
              <h3 style={{ margin: '0 0 var(--space-4) 0', fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
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
                        background: 'var(--color-base100)',
                        border: '1px solid var(--color-border-default)',
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
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {tool.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', lineHeight: 1.4, paddingLeft: 'calc(8px + var(--space-3))' }}>
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
  deleteLoading,
  deleteError,
  onDeleteWorkspace,
  onClearDeleteError,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('overview');

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <DashboardLayout>
      <DashboardLayout.Header
        leftContent={
          <Flex align="center" gap="var(--space-4)">
            <Button variant="ghost" size="sm" onClick={onBackToWorkspace} leftIcon={<ArrowLeft size={14} />}>
              Workspace
            </Button>

            <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
              Workspaces
            </Button>

            <Divider vertical style={{ height: '20px' }} />

            <div>
              <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Workspace Settings</h1>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-disabled)' }}>Managing {workspace.name}</p>
            </div>
          </Flex>
        }
        rightContent={
          <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading}>
            {saveSuccess ? 'Changes Saved' : 'Save Changes'}
          </Button>
        }
      />

      <DashboardLayout.Sidebar>
        <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', height: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-card)', border: '1px solid var(--color-border-default)' }}>
            <Avatar src={currentUser.avatar} name={currentUser.name} size="md" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{currentUser.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>Managing {workspace.key}</div>
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
                    background: isActive ? 'var(--color-surface-card)' : 'transparent',
                    borderColor: isActive ? 'var(--color-border-default)' : 'transparent',
                    cursor: 'pointer',
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)'
                  }}
                  className="clickable lib-focus-ring"
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={16} style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-disabled)', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{category.label}</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)', marginTop: '2px', lineHeight: 1.2 }}>{category.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </DashboardLayout.Sidebar>

      <DashboardLayout.Main>
        <DashboardLayout.Content>
          <div style={{ padding: 'var(--space-6) var(--space-6) var(--space-8) var(--space-6)', maxWidth: '800px', margin: '0 auto' }}>
            <Stack gap="var(--space-5)">
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>
                  Settings Section
                </span>
                <h2 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                  {activeCategoryMeta.label}
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: 'var(--color-text-disabled)', lineHeight: 1.5 }}>
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
          </div>
        </DashboardLayout.Content>
      </DashboardLayout.Main>
    </DashboardLayout>
  );
}
