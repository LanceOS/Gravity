import { McpContext, McpRequestPayload } from './types.js';

function normalizeContextValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

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
