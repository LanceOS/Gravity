import { McpContext, McpRequestPayload } from './types.js';

function normalizeContextValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Builds the handler context from request data plus transport-provided fallback
 * values. The actor identity only comes from the trusted transport fallback,
 * never from request payload fields.
 */
export function resolveMcpContext(
  payload: McpRequestPayload,
  fallback: Partial<McpContext> = {},
): McpContext {
  const requestWorkspaceId = normalizeContextValue(payload.params?.workspaceId);

  return {
    workspaceId: normalizeContextValue(fallback.workspaceId) || requestWorkspaceId,
    actorUserId: normalizeContextValue(fallback.actorUserId),
  };
}
