import React from 'react';
import { Card, Stack, Switch, Alert } from '@library';
import { useSettingsScreenContext } from '../contexts/SettingsScreenContext';

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
        description: 'Allows updating description, title, priority, cycle, label, and status of existing tickets.',
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

export function McpToolsSection(): JSX.Element {
  const { workspace, settings, onChangeSettings } = useSettingsScreenContext();

  const isOwner = workspace.memberRole === 'owner';
  const disabledTools = settings.disabledMcpTools || [];

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
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

        <Stack gap="var(--space-lg)">
          {MCP_TOOL_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 style={{ margin: '0 0 var(--space-md) 0', fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {group.title}
              </h3>
              <Stack gap="var(--space-md)">
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
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 'var(--space-md)',
                        padding: 'var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-base100)',
                        border: '1px solid var(--color-border-default)',
                        transition: 'border-color 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
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
                        <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', lineHeight: 1.4, paddingLeft: 'calc(8px + var(--space-md))' }}>
                          {tool.description}
                        </span>
                      </div>

                      <div style={{ paddingLeft: 'calc(8px + var(--space-md))' }}>
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
