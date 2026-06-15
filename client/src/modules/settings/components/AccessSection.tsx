import React, { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { Card, Stack, TextInput, Button, Badge } from '@library';
import { useSettingsScreenContext } from '../../../context/settings/useSettingsScreenContext';

const COPY_FEEDBACK_STORAGE_KEY = 'gravity_peer_invite_copy_feedback';
const COPY_FEEDBACK_DURATION_MS = 2200;

function getInviteStateLabel(invite: WorkspaceInvite) {
  if (invite.revokedAt) return 'Revoked';
  return 'Active';
}

function getInviteStateVariant(invite: WorkspaceInvite): 'accent' | 'success' | 'error' | 'warning' | 'default' {
  if (invite.revokedAt) return 'error';
  return 'success';
}

export function AccessSection(): JSX.Element {
  const { isMobile, invites, invitesLoading, inviteLoading, revokeLoadingId, onCreateInvite, onRevokeInvite } =
    useSettingsScreenContext();

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
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Workspace Invites</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Create secure, shareable invitation links for users to request access or join this workspace.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
          <Mail size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Invitation Link Process</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', marginTop: '4px', lineHeight: 1.5 }}>
              Share the invitation URL. Visited guest users can immediately send a join request, which you can approve in the "Join Requests" tab.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 'var(--space-md)', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
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
          <Stack gap="var(--space-md)" style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'rgba(170, 59, 255, 0.02)', border: '1px solid rgba(170, 59, 255, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>Most Recent Invite</span>
                <h4 style={{ margin: '2px 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{latestInvite.label || 'No Label'}</h4>
              </div>
              <Badge variant={getInviteStateVariant(latestInvite)}>
                {getInviteStateLabel(latestInvite)}
              </Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>Invite URL</span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getInviteLink(latestInvite.code)}</span>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
                <Button variant="default" size="xs" onClick={() => void handleCopy('invite-url', getInviteLink(latestInvite.code))}>
                  {copiedField === 'invite-url' ? 'Copied URL' : 'Copy Invite URL'}
                </Button>
                <Button variant="default" size="xs" onClick={() => void handleCopy('invite-code', latestInvite.code)}>
                  {copiedField === 'invite-code' ? 'Copied Code' : 'Copy Code Only'}
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: 'var(--space-xs)' }}>
              <span>Created by {latestInvite.createdByName}</span>
              <span>Used {latestInvite.useCount} times</span>
              {latestInvite.revokedAt && <span>Revoked {new Date(latestInvite.revokedAt).toLocaleString()}</span>}
            </div>

            {!latestInvite.revokedAt && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-sm)' }}>
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

        {invitesLoading && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-md)' }}>Loading invites...</div>}
        {!invitesLoading && invites.length === 0 && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-md)' }}>No invites exist yet for this workspace.</div>}

        {invites.length > 0 && (
          <Stack gap="var(--space-md)" style={{ marginTop: 'var(--space-sm)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>Historical Invites ({invites.length})</span>
            {invites.map((invite) => (
              <div
                key={invite.id}
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-md)',
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-base100)',
                  border: '1px solid var(--color-border-default)'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{invite.label || 'No Label'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                    <span>Code: {invite.code}</span>
                    <span>Used: {invite.useCount}</span>
                    <span>Created by: {invite.createdByName}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
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
