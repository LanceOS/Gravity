import type { McpToolDefinition } from './types.js';

// Compatibility names share policy but retain their own input schemas.
export const TOOL_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['get_ticket', 'get_ticket_details', 'read_ticket_details'],
  ['create_comment', 'add_comment'],
  ['mark_ticket_blocked', 'add_ticket_dependency', 'add_dependency'],
  ['unmark_ticket_blocked', 'remove_ticket_dependency', 'remove_dependency'],
];

export const mcpToolsList: McpToolDefinition[] = [];

export function canonicalToolName(name: string): string {
  const legacy = TOOL_ALIAS_GROUPS.find((group) => group.includes(name));
  if (legacy) return legacy.find((candidate) => mcpToolsList.some((tool) => tool.name === candidate)) ?? legacy[0];
  return mcpToolsList.find((tool) => tool.aliases?.includes(name))?.name ?? name;
}

export function getToolDefinition(name: string): McpToolDefinition | undefined {
  return mcpToolsList.find((tool) => tool.name === name)
    ?? mcpToolsList.find((tool) => tool.aliases?.includes(name));
}

export function registerMcpTools(tools: McpToolDefinition[]) {
  for (const tool of tools) {
    const readOnly = /^(get|read|list|search|preview)_/.test(tool.name);
    const aliases = TOOL_ALIAS_GROUPS.find((group) => group[0] === tool.name)?.slice(1);
    const definition: McpToolDefinition = {
      ...tool,
      inputSchema: { additionalProperties: false, ...tool.inputSchema },
      outputSchema: tool.outputSchema ?? {
        type: 'object', properties: { data: {} }, required: ['data'], additionalProperties: false,
      },
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: /^(delete|remove|set)_/.test(tool.name),
        idempotentHint: readOnly || /^(set|clear|unassign|update|edit)_/.test(tool.name),
        openWorldHint: false,
        ...tool.annotations,
      },
      permission: tool.permission ?? (readOnly ? 'read' : 'write'),
      ...(aliases ? { aliases: [...aliases] } : {}),
    };
    const existing = mcpToolsList.findIndex((entry) => entry.name === tool.name);
    if (existing < 0) mcpToolsList.push(definition);
    else mcpToolsList[existing] = definition;
  }
}

export function listCanonicalTools(): McpToolDefinition[] {
  return mcpToolsList.filter((tool) => canonicalToolName(tool.name) === tool.name);
}
