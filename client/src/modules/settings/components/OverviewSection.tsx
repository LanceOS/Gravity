import React from 'react';
import { Globe, Users, UserPlus } from 'lucide-react';
import { Card, Stack, Grid, TextInput, Select, Divider } from '@library';
import { useSettingsScreenContext } from '../../../context/settings/useSettingsScreenContext';

export function OverviewSection(): JSX.Element {
  const { isMobile, workspace, settings, onChangeSettings } = useSettingsScreenContext();

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Host Configuration</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Manage the remote configuration and identity of this workspace. These controls govern peer networking, host routing, and invitation schemes.
          </p>
        </div>

        <Grid columns={isMobile ? 1 : 2} gap="var(--space-md)">
          <TextInput label="Workspace Name" value={workspace.name} disabled />
          <TextInput label="Workspace Key" value={workspace.key} disabled />
        </Grid>

        <TextInput
          label="Host URL"
          value={settings.hostUrl}
          placeholder="http://localhost:5000"
          onChange={(event) => onChangeSettings({ hostUrl: event.target.value })}
        />

        <Grid columns={isMobile ? 1 : 2} gap="var(--space-md)">
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

        <Grid columns={isMobile ? 1 : 3} gap="var(--space-md)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
            <Globe size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>Projects</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>{workspace.projectCount} child projects</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
            <Users size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>Members</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>{workspace.memberCount} approved users</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'var(--color-base100)', border: '1px solid var(--color-border-default)' }}>
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
