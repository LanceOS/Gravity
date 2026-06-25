import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { projects } from '../../../db/schema.js';

type DbErrorCandidate = {
  message?: unknown;
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
  cause?: unknown;
};

export function buildProjectKeyConflictMessage(projectKey: string) {
  return `Project key ${projectKey} is already in use in this workspace. Choose a different key.`;
}

export function buildProjectInviteConflictMessage() {
  return 'Could not reserve a unique project invite code. Please try again.';
}

export async function projectKeyExists(projectKey: string, workspaceId?: string) {
  if (!workspaceId) {
    return false;
  }

  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.key, projectKey)))
    .limit(1);
  return Boolean(rows[0]);
}

function unwrapDbErrors(error: unknown) {
  const candidates: DbErrorCandidate[] = [];
  let current = error as DbErrorCandidate | undefined;

  while (current && typeof current === 'object') {
    candidates.push(current);
    current = current.cause as DbErrorCandidate | undefined;
  }

  return candidates;
}

export function mapProjectCreationError(error: unknown, projectKey: string) {
  for (const candidate of unwrapDbErrors(error)) {
    const code = typeof candidate.code === 'string' ? candidate.code : '';
    const constraint = typeof candidate.constraint === 'string' ? candidate.constraint : '';
    const detail = typeof candidate.detail === 'string' ? candidate.detail : '';
    const message = typeof candidate.message === 'string' ? candidate.message : '';

    if (code === '23505' || /duplicate key value|unique constraint/i.test(detail) || /duplicate key value|unique constraint/i.test(message)) {
      if (constraint === 'projects_invite_code_key' || /invite_code/i.test(detail) || /projects_invite_code_key/i.test(message)) {
        return { status: 503, message: buildProjectInviteConflictMessage() };
      }

      if (
        constraint === 'projects_key_key'
        || constraint === 'projects_workspace_id_key_key'
        || /projects_workspace_id_key/i.test(constraint)
        || /Key \(workspace_id, key\)=/.test(detail)
        || /projects_key_key/i.test(message)
        || /projects_workspace_id_key/i.test(message)
      ) {
        return { status: 409, message: buildProjectKeyConflictMessage(projectKey) };
      }

      return { status: 409, message: buildProjectKeyConflictMessage(projectKey) };
    }
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : 'Failed to create project.',
  };
}
