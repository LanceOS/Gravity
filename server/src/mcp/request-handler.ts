import { assertMcpWorkspaceAccess } from './access.js';
import { executeTool } from './tool-executor.js';
import { resolveMcpContext } from './request-context.js';
import { createMcpErrorResponse } from './responses.js';
import { mcpToolsList } from './tools.js';
import { McpRequestPayload } from './types.js';
import { getDisabledTools } from './workspace-tools.js';

/**
 * @description Lets transports skip the membership query when they already
 * performed the same access check earlier in the request pipeline.
 */
type McpRequestHandlerOptions = {
  accessChecked?: boolean;
};

/**
 * @description Processes MCP JSON-RPC requests after the transport has already
 * established any trusted workspace and actor context.
 */
export class McpRequestHandler {
  /**
   * @description Handles the JSON-RPC portion of the MCP protocol after the
   * transport has supplied any trusted workspace or actor context.
   * @param request Incoming JSON-RPC request payload.
   * @param workspaceId Trusted workspace id from the transport.
   * @param actorUserId Trusted actor id from the transport.
   * @param options Handler execution options.
   * @return The JSON-RPC response payload for the requested MCP method.
   */
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
        // Initialization is transport-agnostic and does not require workspace access.
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
        // HTTP may have already checked membership; stdio and direct callers rely on the handler.
        if (!accessChecked) {
          await assertMcpWorkspaceAccess(context);
        }
        const disabledTools = await getDisabledTools(context.workspaceId);
        const activeTools = mcpToolsList.filter((tool) => {
          if (disabledTools.includes(tool.name)) {
            return false;
          }
          if (tool.name === 'add_comment' && disabledTools.includes('create_comment')) {
            return false;
          }
          if (tool.name === 'create_comment' && disabledTools.includes('add_comment')) {
            return false;
          }
          return true;
        });
        return {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          result: { tools: activeTools },
        };
      }

      if (payload.method === 'tools/call') {
        // Tool execution always uses the trusted context resolved above.
        if (!accessChecked) {
          await assertMcpWorkspaceAccess(context);
        }
        const toolName = payload.params?.name ?? '';
        const disabledTools = await getDisabledTools(context.workspaceId);

        const disablementAlias =
          toolName === 'create_comment' ? 'add_comment' : toolName === 'add_comment' ? 'create_comment' : null;

        if (disabledTools.includes(toolName) || (disablementAlias && disabledTools.includes(disablementAlias))) {
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

/**
 * @description Convenience wrapper for the default request handler used by both
 * transports.
 * @param request Incoming JSON-RPC request payload.
 * @param workspaceId Trusted workspace id from the transport.
 * @param actorUserId Trusted actor id from the transport.
 * @param options Handler execution options.
 * @return The JSON-RPC response payload produced by the default handler.
 */
export async function handleMcpRequest(
  request: unknown,
  workspaceId = '',
  actorUserId = '',
  options: McpRequestHandlerOptions = {},
) {
  return defaultRequestHandler.handle(request, workspaceId, actorUserId, options);
}
