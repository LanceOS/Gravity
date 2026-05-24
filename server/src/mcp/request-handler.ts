import { executeTool } from './tool-executor.js';
import { mcpToolsList } from './tools.js';
import { McpRequestPayload } from './types.js';
import { getDisabledTools } from './workspace-tools.js';

export class McpRequestHandler {
  async handle(request: unknown, workspaceId = '', actorUserId = '') {
    const payload = request as McpRequestPayload;

    if (payload.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'gravity-mcp-server', version: '2.0.0' },
        },
      };
    }

    if (payload.method === 'tools/list') {
      const disabledTools = await getDisabledTools(workspaceId);
      const activeTools = mcpToolsList.filter((tool) => !disabledTools.includes(tool.name));

      return {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        result: { tools: activeTools },
      };
    }

    if (payload.method === 'tools/call') {
      try {
        const toolName = payload.params?.name ?? '';
        const disabledTools = await getDisabledTools(workspaceId);

        if (disabledTools.includes(toolName)) {
          throw new Error(`MCP tool "${toolName}" is disabled in this workspace.`);
        }

        const result = await executeTool(
          toolName,
          payload.params?.arguments ?? {},
          workspaceId,
          actorUserId,
        );
        return {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error executing tool',
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      error: {
        code: -32601,
        message: `Method not found: ${payload.method ?? 'unknown'}`,
      },
    };
  }
}

const defaultRequestHandler = new McpRequestHandler();

export async function handleMcpRequest(request: unknown, workspaceId = '', actorUserId = '') {
  return defaultRequestHandler.handle(request, workspaceId, actorUserId);
}
