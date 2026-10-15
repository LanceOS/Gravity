import { MetadataRepository, type NoteMetadata } from '../repositories.js';
import { canAccessNote, type NoteActor, type NoteAction } from '../policy.js';

export { canAccessNote } from '../policy.js';
export type { NoteActor, NoteAction } from '../policy.js';

export async function authorizedNote(
  noteId: string, projectId: string, actor: NoteActor, action: NoteAction,
): Promise<NoteMetadata | null> {
  const note = await MetadataRepository.getNoteMetadata(noteId);
  return note?.projectId === projectId && canAccessNote(note, actor, action) ? note : null;
}
