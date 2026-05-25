import { assertMcpWorkspaceAccess } from './access.js';
import { executeTool } from './tool-executor.js';
import { resolveMcpContext } from './request-context.js';
import { createMcpErrorResponse } from './responses.js';
import { mcpToolsList } from './tools.js';
import { McpRequestPayload } from './types.js';
import { getDisabledTools } from './workspace-tools.js';

type McpRequestHandlerOptions = {
  accessChecked?: boolean;
};

export class McpRequestHandler {
  async handle(
    request: unknown,
    workspaceId = '',
    actorUserId = '',
    options: McpRequestHandlerOptions = {},
  ) {
    const payload = request as McpRequestPayload;
    const context = resolveMcpContext(payload, { workspaceId, actorUserId });
    const accessChecked = options.accessChecked === true;

    try {
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
        if (!accessChecked) {
          await assertMcpWorkspaceAccess(context);
        }
        const disabledTools = await getDisabledTools(context.workspaceId);
        const activeTools = mcpToolsList.filter((tool) => !disabledTools.includes(tool.name));

        return {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          result: { tools: activeTools },
        };
      }

      if (payload.method === 'tools/call') {
        if (!accessChecked) {
          await assertMcpWorkspaceAccess(context);
        }
        const toolName = payload.params?.name ?? '';
        const disabledTools = await getDisabledTools(context.workspaceId);

        if (disabledTools.includes(toolName)) {
          throw new Error(`MCP tool "${toolName}" is disabled in this workspace.`);
        }

        const result = await executeTool(
          toolName,
          payload.params?.arguments ?? {},
          context.workspaceId,
          context.actorUserId,
        );
        return {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      }

      return createMcpErrorResponse(payload.id, -32601, `Method not found: ${payload.method ?? 'unknown'}`);
    } catch (error) {
      return createMcpErrorResponse(
        payload.id,
        -32603,
        error instanceof Error ? error.message : 'Internal error executing tool',
      );
    }
  }
}

const defaultRequestHandler = new McpRequestHandler();

export async function handleMcpRequest(
  request: unknown,
  workspaceId = '',
  actorUserId = '',
  options: McpRequestHandlerOptions = {},
) {
  return defaultRequestHandler.handle(request, workspaceId, actorUserId, options);
}
