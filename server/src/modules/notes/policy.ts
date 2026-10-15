import { and, eq, or } from 'drizzle-orm';
import { noteMetadata } from './schema.js';

export type NoteActor = { userId: string; workspaceRole: string };
export type NoteAction = 'read' | 'write' | 'manage';

export function canAccessNote(
  note: { userId: string; visibility: 'private' | 'shared' }, actor: NoteActor, action: NoteAction,
): boolean {
  if (note.userId === actor.userId) return true;
  if (note.visibility !== 'shared') return false;
  if (action !== 'manage') return true;
  return actor.workspaceRole === 'owner' || actor.workspaceRole === 'admin';
}

export function visibleNotesCondition(projectId: string, userId: string) {
  return and(
    eq(noteMetadata.projectId, projectId),
    or(eq(noteMetadata.userId, userId), eq(noteMetadata.visibility, 'shared')),
  );
}
