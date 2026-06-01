import React from 'react';
import { Card, Stack, Avatar, Badge } from '@library';
import type { WorkspaceMember } from '../../../hooks/useWorkspaceSettings';

interface MembersSectionProps {
  members: WorkspaceMember[];
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

export function MembersSection({ members }: MembersSectionProps) {
  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Approved Members</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Membership controls the access boundary. Users listed here are fully approved to access project tasks and collaborate inside this workspace.
          </p>
        </div>

        {members.length === 0 && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-md)' }}>No members are assigned to this workspace yet.</div>}

        <Stack gap="var(--space-md)">
          {members.map((member) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-base100)',
                border: '1px solid var(--color-border-default)',
                minWidth: 0,
              }}
            >
              <Avatar src={member.avatar} name={member.name} size="md" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{member.name}</span>
                  <Badge variant={member.role === 'owner' ? 'accent' : 'default'}>
                    {member.role}
                  </Badge>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {member.email}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: '4px', fontStyle: 'italic' }}>
                  Last active: {formatLastActive(member.lastActiveAt)}
                </div>
              </div>
            </div>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
