import React from 'react';
import { Card, Stack, Switch, Alert } from '@library';
import { useSettingsScreenContext } from '../../../context/settings/useSettingsScreenContext';
import { useMcpCatalog } from '../../../hooks/useMcpCatalog';
import { mcpToolLabel } from '../../../utils/mcp';

export function McpToolsSection(): React.ReactNode {
  const { workspace, settings, onChangeSettings } = useSettingsScreenContext();
  const { tools, loading, error } = useMcpCatalog(workspace.id);
  const isOwner = workspace.memberRole === 'owner';
  const disabledTools = settings.disabledMcpTools || [];
  const isDirectlyDisabled = (name: string) => {
    const definition = tools.find(tool => tool.name === name || tool.aliases?.includes(name));
    return [name, definition?.name, ...(definition?.aliases || [])].some(candidate => candidate && disabledTools.includes(candidate));
  };

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2>MCP Agent Tools</h2>
          <p>Choose which tools AI assistants can use in this workspace. Each control also applies to the tool's compatibility aliases.</p>
        </div>
        {!isOwner && <Alert type="info">Only workspace owners can enable or disable MCP agent tools.</Alert>}
        {loading && <p role="status">Loading available tools…</p>}
        {error && <Alert type="error">{error}</Alert>}
        {!loading && !error && tools.length === 0 && <p>No MCP tools are available.</p>}
        {[
          { title: 'Read Tools', tools: tools.filter(tool => tool.annotations?.readOnlyHint === true) },
          { title: 'Write Tools', tools: tools.filter(tool => tool.annotations?.readOnlyHint !== true) },
        ].filter(group => group.tools.length > 0).map(group => (
          <div key={group.title}>
            <h3>{group.title}</h3>
            <Stack gap="var(--space-md)">
              {group.tools.map(tool => {
                const names = [tool.name, ...(tool.aliases || [])];
                const disabledParents = (tool.policyParents || []).filter(isDirectlyDisabled);
                const inheritedDisablement = disabledParents.length > 0;
                const isEnabled = !isDirectlyDisabled(tool.name) && !inheritedDisablement;
                return (
                  <div key={tool.name} data-testid={`mcp-tool-row-${tool.name}`} style={{ padding: 'var(--space-md)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
                    <strong>{mcpToolLabel(tool.name)}</strong>
                    {tool.annotations?.destructiveHint && <span> · Destructive</span>}
                    <p>{tool.description}</p>
                    {inheritedDisablement && <p>Enable {disabledParents.map(mcpToolLabel).join(' and ')} before using this tool. Its individual setting is preserved.</p>}
                    <Switch label={inheritedDisablement ? 'Disabled by workspace policy' : isEnabled ? 'Enabled' : 'Disabled'} checked={isEnabled} disabled={!isOwner || inheritedDisablement}
                      onCheckedChange={checked => {
                        const otherDisabled = disabledTools.filter(name => !names.includes(name));
                        onChangeSettings({ disabledMcpTools: checked ? otherDisabled : [...otherDisabled, tool.name] });
                      }} />
                  </div>
                );
              })}
            </Stack>
          </div>
        ))}
      </Stack>
    </Card>
  );
}
