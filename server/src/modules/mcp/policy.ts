import { assertMcpWorkspaceAccess } from './access.js';
import { McpToolError } from './errors.js';
import { canonicalToolName, getToolDefinition, listCanonicalTools } from './tools.js';
import { getDisabledTools } from './workspace-tools.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { workspaceMembers, workspaces } from '../workspaces/schema.js';

// Broad legacy controls continue to cover focused mutations of the same fields.
const UPDATE_FIELDS: Record<string, string[]> = {
  title: ['edit_ticket_content'], description: ['edit_ticket_content'],
  status: ['set_ticket_status'], priority: ['set_ticket_priority'],
  assigneeId: ['assign_ticket', 'unassign_ticket'],
  cycleId: ['set_ticket_cycle', 'clear_ticket_cycle'],
  parentId: ['set_ticket_parent', 'clear_ticket_parent'],
  labels: ['set_ticket_labels', 'add_ticket_labels', 'remove_ticket_labels'],
  labelIds: ['set_ticket_labels', 'add_ticket_labels', 'remove_ticket_labels'],
  prStatus: ['set_ticket_pr'], prUrl: ['set_ticket_pr'], projectId: ['move_ticket'],
};
const FOCUSED_UPDATES = new Set(Object.values(UPDATE_FIELDS).flat());

export function getToolPolicyParents(name: string): string[] {
  const canonical = canonicalToolName(name);
  if (FOCUSED_UPDATES.has(canonical)) return ['update_ticket'];
  if (canonical === 'search_tickets') return ['list_tickets'];
  return [];
}

export function isToolDisabled(name: string, disabledTools: string[]): boolean {
  const canonical = canonicalToolName(name);
  const disabled = new Set(disabledTools.map(canonicalToolName));
  return disabled.has(canonical)
    || getToolPolicyParents(canonical).some((parent) => disabled.has(parent));
}

export function hasToolCallScope(name: string, scopes?: string[]): boolean {
  if (!scopes) return true;
  if (scopes.includes('tools/call') || scopes.includes('tools/call:*')) return true;
  return scopes.some((scope) => scope.startsWith('tools/call:')
    && canonicalToolName(scope.slice('tools/call:'.length)) === canonicalToolName(name));
}

export function getAvailableTools(disabledTools: string[], tokenScopes?: string[]) {
  return listCanonicalTools().filter((tool) => !isToolDisabled(tool.name, disabledTools)
    && hasToolCallScope(tool.name, tokenScopes));
}

export async function assertToolExecutionAllowed(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string,
  actorUserId: string,
  options: { tokenScopes?: string[] } = {},
) {
  try {
    await assertMcpWorkspaceAccess({ workspaceId, actorUserId });
  } catch (error) {
    throw new McpToolError(error instanceof Error ? error.message : 'Unauthorized workspace access.', -32001);
  }
  const definition = getToolDefinition(name);
  if (!definition) throw new McpToolError(`Unknown tool: ${name}`, -32602);
  if (!hasToolCallScope(name, options.tokenScopes)) {
    throw new McpToolError('Insufficient token scopes.', -32001);
  }
  // A previously issued write credential must not retain elevated access after
  // its issuer is demoted. Read directly, avoiding a stale membership cache.
  if (options.tokenScopes && definition.annotations?.readOnlyHint !== true) {
    const [workspace] = await db.select({ owner: workspaces.createdBy }).from(workspaces)
      .where(eq(workspaces.id, workspaceId)).limit(1);
    const [membership] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId))).limit(1);
    if (workspace?.owner !== actorUserId && membership?.role !== 'owner' && membership?.role !== 'admin') {
      throw new McpToolError('Workspace owner or admin access is required for connection-token writes.', -32001);
    }
  }
  const disabled = await getDisabledTools(workspaceId);
  if (isToolDisabled(name, disabled)) {
    throw new McpToolError(`MCP tool "${name}" is disabled in this workspace.`, -32001);
  }
  if (name === 'update_ticket') {
    for (const field of Object.keys(args)) {
      let operations = UPDATE_FIELDS[field] ?? [];
      if (['assigneeId', 'cycleId', 'parentId'].includes(field)) {
        operations = [operations[args[field] === null ? 1 : 0]];
      }
      if (operations.some((operation) => isToolDisabled(operation, disabled))) {
        throw new McpToolError(`Updating ${field} is disabled in this workspace.`, -32001);
      }
    }
  }
}
