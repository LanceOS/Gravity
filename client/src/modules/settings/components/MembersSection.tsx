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
