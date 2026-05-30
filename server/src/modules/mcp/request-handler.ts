import { assertMcpWorkspaceAccess } from './access.js';
import { executeTool } from './tool-executor.js';
import { resolveMcpContext } from './request-context.js';
import { createMcpErrorResponse } from './responses.js';
import { mcpToolsList } from './tools.js';
import type { McpRequestPayload } from './types.js';
import { getDisabledTools } from './workspace-tools.js';
import { desanitize, sanitize } from './state-map.js';

/**
 * @description Lets transports skip the membership query when they already
 * performed the same access check earlier in the request pipeline.
 */
type McpRequestHandlerOptions = {
  accessChecked?: boolean;
  sanitize?: boolean;
  tokenScopes?: string[];
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
    const tokenScopes = Array.isArray(options.tokenScopes) ? options.tokenScopes : undefined;

    // tokenScopes is available when requests were authenticated via connection tokens.

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
        // If the transport supplied token scopes (external clients), enforce them here.
        if (tokenScopes && !tokenScopes.includes('tools/list')) {
          return createMcpErrorResponse(payload.id ?? null, -32001, 'Insufficient token scopes.');
        }
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
        // Enforce token scopes for external clients when provided.
        if (tokenScopes) {
          const toolName = payload.params?.name ?? '';
          const hasGlobalCall = tokenScopes.includes('tools/call') || tokenScopes.includes('tools/call:*');
          const hasExactCall = typeof toolName === 'string' && toolName.length > 0 && tokenScopes.includes(`tools/call:${toolName}`);
          if (!hasGlobalCall && !hasExactCall) {
            return createMcpErrorResponse(payload.id ?? null, -32001, 'Insufficient token scopes.');
          }
        }
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

        const shouldSanitize = options.sanitize === true;
        const rawArgs = payload.params?.arguments ?? {};
        const desanitizedArgs = shouldSanitize ? desanitize(rawArgs) : rawArgs;

        const result = await executeTool(
          toolName,
          desanitizedArgs,
          context.workspaceId,
          context.actorUserId,
        );

        const sanitizedResult = shouldSanitize ? sanitize(result) : result;

        return {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          result: {
            content: [{ type: 'text', text: JSON.stringify(sanitizedResult, null, 2) }],
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
