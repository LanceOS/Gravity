import { assertMcpWorkspaceAccess } from './access.js';
import { McpToolError, McpToolValidationError } from './errors.js';
import { executeTool } from './tool-executor.js';
import { resolveMcpContext } from './request-context.js';
import { createMcpErrorResponse } from './responses.js';
import { getToolDefinition } from './tools.js';
import { createWorkspaceScopeViolationError } from './scope.js';
import type { McpRequestPayload } from './types.js';
import { getDisabledTools } from './workspace-tools.js';
import { desanitize, sanitize, withMcpStateScope } from './state-map.js';
import { getAvailableTools, hasToolCallScope } from './policy.js';
import { validateToolArguments } from './validation.js';

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

type McpRequestHandlerOptions = {
  accessChecked?: boolean;
  sanitize?: boolean;
  tokenScopes?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toolResult(data: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data ?? null, null, 2) }],
    structuredContent: isError ? { error: data } : { data: data ?? null },
    isError,
  };
}

/** Transport-independent protocol handling. All actual dispatch policy lives in the executor. */
export class McpRequestHandler {
  async handle(request: unknown, workspaceId = '', actorUserId = '', options: McpRequestHandlerOptions = {}) {
    if (!isRecord(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string'
      || (request.params !== undefined && !isRecord(request.params))
      || (request.id !== undefined && typeof request.id !== 'string'
        && !(typeof request.id === 'number' && Number.isFinite(request.id)))) {
      return createMcpErrorResponse(isRecord(request) && (typeof request.id === 'string' || typeof request.id === 'number') ? request.id : null,
        -32600, 'Invalid JSON-RPC request.');
    }
    const payload = request as McpRequestPayload;
    // Notifications never receive a response and cannot invoke request methods.
    if (payload.id === undefined) return null;
    const context = resolveMcpContext(payload, { workspaceId, actorUserId });
    return withMcpStateScope(JSON.stringify([context.workspaceId, context.actorUserId]), async () => {
      try {
        if (payload.method === 'initialize') {
          const requested = payload.params?.protocolVersion;
          const protocolVersion = SUPPORTED_MCP_PROTOCOL_VERSIONS.find((version) => version === requested)
            ?? SUPPORTED_MCP_PROTOCOL_VERSIONS[0];
          return { jsonrpc: '2.0', id: payload.id, result: {
            protocolVersion, capabilities: { tools: {} },
            serverInfo: { name: 'gravity-mcp-server', version: '0.8.1' },
            instructions: 'Use discovery tools to resolve project, cycle, assignee and label references. All operations are bound to the authorized workspace.',
          } };
        }
        if (payload.method === 'ping') return { jsonrpc: '2.0', id: payload.id, result: {} };
        if (payload.method === 'tools/list') {
          if (options.tokenScopes && !options.tokenScopes.includes('tools/list')) {
            return createMcpErrorResponse(payload.id, -32001, 'Insufficient token scopes.');
          }
          if (!options.accessChecked) await assertMcpWorkspaceAccess(context);
          const disabled = await getDisabledTools(context.workspaceId);
          const tools = getAvailableTools(disabled, options.tokenScopes);
          return { jsonrpc: '2.0', id: payload.id, result: { tools } };
        }
        if (payload.method !== 'tools/call') {
          return createMcpErrorResponse(payload.id, -32601, `Method not found: ${payload.method}`);
        }
        const name = payload.params?.name;
        if (typeof name !== 'string' || !name.trim()) {
          return createMcpErrorResponse(payload.id, -32602, 'Tool name is required.');
        }
        if (!hasToolCallScope(name, options.tokenScopes)) {
          return createMcpErrorResponse(payload.id, -32001, 'Insufficient token scopes.');
        }
        const requestedWorkspaceId = typeof payload.params?.workspaceId === 'string' ? payload.params.workspaceId.trim() : '';
        if (requestedWorkspaceId && requestedWorkspaceId !== context.workspaceId) {
          const error = await createWorkspaceScopeViolationError(context.workspaceId, {
            action: 'tools/call', toolName: name, requestedWorkspaceId,
            actorUserId: context.actorUserId || undefined, requestId: payload.id,
          });
          return createMcpErrorResponse(payload.id, error.code, error.message, error.data);
        }
        const definition = getToolDefinition(name);
        if (!definition) return createMcpErrorResponse(payload.id, -32602, `Unknown tool: ${name}`);
        const rawArgs = payload.params?.arguments === undefined ? {} : payload.params.arguments;
        const args: unknown = options.sanitize ? desanitize(rawArgs) : rawArgs;
        // Schema errors describe a malformed call and must never reach a handler.
        validateToolArguments(definition, args);
        try {
          const result = await executeTool(name, args, context.workspaceId, context.actorUserId, { tokenScopes: options.tokenScopes });
          const data = options.sanitize ? sanitize(result) : result;
          const domainFailure = isRecord(data) && data.ok === false;
          return { jsonrpc: '2.0', id: payload.id, result: toolResult(data, domainFailure) };
        } catch (error) {
          // Authorization failures remain protocol errors. Domain errors are
          // visible to the model as tool failures so it can correct its input.
          if (error instanceof McpToolError && !(error instanceof McpToolValidationError)) throw error;
          const failure = {
            code: error instanceof McpToolValidationError ? 'INVALID_ARGUMENTS' : 'TOOL_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : 'Tool execution failed.',
            ...(error instanceof McpToolError && error.data ? { details: error.data } : {}),
          };
          return { jsonrpc: '2.0', id: payload.id, result: toolResult(failure, true) };
        }
      } catch (error) {
        return createMcpErrorResponse(payload.id, error instanceof McpToolError ? error.code : -32603,
          error instanceof Error ? error.message : 'Internal error handling MCP request.',
          error instanceof McpToolError ? error.data : undefined);
      }
    });
  }
}

const defaultRequestHandler = new McpRequestHandler();
export function handleMcpRequest(request: unknown, workspaceId = '', actorUserId = '', options: McpRequestHandlerOptions = {}) {
  return defaultRequestHandler.handle(request, workspaceId, actorUserId, options);
}
