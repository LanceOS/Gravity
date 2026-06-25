import { eq } from 'drizzle-orm';
import { audit } from '../../lib/logger.js';
import { db } from '../../db/index.js';
import { workspaces } from '../../db/schema.js';
import type { McpErrorData } from './errors.js';
import { McpToolValidationError } from './errors.js';

const WORKSPACE_SCOPE_ERROR_TEMPLATE =
  'This action is scoped to workspace %s and cannot be performed on resources in other workspaces.';

function normalizeWorkspaceName(value: string) {
  return value.trim() || 'this workspace';
}

async function resolveWorkspaceName(workspaceId: string): Promise<string> {
  if (!workspaceId) {
    return 'this workspace';
  }

  try {
    const rows = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    return normalizeWorkspaceName(rows[0]?.name ?? workspaceId);
  } catch {
    return normalizeWorkspaceName(workspaceId);
  }
}

function scopeViolationMessage(workspaceName: string) {
  return WORKSPACE_SCOPE_ERROR_TEMPLATE.replace('%s', workspaceName);
}

export async function createWorkspaceScopeViolationError(
  contextWorkspaceId: string,
  details: McpErrorData = {},
): Promise<McpToolValidationError> {
  const workspaceName = await resolveWorkspaceName(contextWorkspaceId);
  const message = scopeViolationMessage(workspaceName);

  audit('mcp.scope.violation', {
    action: 'mcp_scope_violation',
    workspaceId: contextWorkspaceId,
    workspaceName,
    ...details,
  });

  return new McpToolValidationError(message, {
    workspaceId: contextWorkspaceId,
    workspaceName,
    ...details,
  });
}

export function isWorkspaceScopeViolationError(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('scoped to workspace')
    && error.message.includes('other workspaces');
}

export { scopeViolationMessage as buildWorkspaceScopeViolationMessage };
