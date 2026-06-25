import type { McpContext, McpRequestPayload } from './types.js';

function normalizeContextValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @description Builds the handler context from request data plus
 * transport-provided fallback values. The actor identity only comes from the
 * trusted transport fallback, never from request payload fields.
 * @param payload Incoming MCP request payload.
 * @param fallback Trusted context supplied by the transport.
 * @return The normalized MCP execution context used by handlers.
 */
export function resolveMcpContext(
  payload: McpRequestPayload,
  fallback: Partial<McpContext> = {},
): McpContext {
  return {
    workspaceId: normalizeContextValue(fallback.workspaceId),
    actorUserId: normalizeContextValue(fallback.actorUserId),
  };
}
