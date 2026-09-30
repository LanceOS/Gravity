import { RustFS } from '../../../lib/rustfs.js';
import { isNoteBodyFile, MetadataRepository, NotesRepository } from '../repositories.js';
import { buildMediaReferenceIndex, type CleanupNote, parseMediaReferences } from './media-cleanup.js';
import { withNoteReferenceLock, type NoteTransaction } from '../reference-lock.js';

export class NoteMediaInUseError extends Error {
  constructor() {
    super('Note attachments are still referenced by other notes.');
  }
}

async function deletionInventory(target: CleanupNote, tx: NoteTransaction) {
  const inventory = await buildMediaReferenceIndex({
    listNotes: () => MetadataRepository.listNotesForMediaCleanup(tx),
    getBody: NotesRepository.getBody,
  });
  if (!inventory.notes.some(note => note.id === target.id && note.bucketPath === target.bucketPath)) {
    throw new Error('Deletion blocked: target missing from reference inventory');
  }
  return inventory;
}

// Refuse the whole operation: media URLs require the source note's metadata,
// so retaining only its objects would still break links in surviving notes.
export async function assertNoteAttachmentsUnshared(target: CleanupNote, tx: NoteTransaction) {
  const inventory = await deletionInventory(target, tx);
  for (const [sourceId, references] of inventory.bySource) {
    if (sourceId !== target.id && references.get(target.id)?.size) {
      throw new NoteMediaInUseError();
    }
  }
}

export async function deleteNoteMedia(noteId: string, projectId: string, filename: string) {
  if (isNoteBodyFile(filename)) throw new Error('Filename is reserved for note bodies');
  return withNoteReferenceLock(async tx => {
    const target = await MetadataRepository.getNoteMetadata(noteId, tx);
    if (!target || target.projectId !== projectId) return null;

    const inventory = await deletionInventory(target, tx);
    const sourceIds = [...inventory.bySource]
      .filter(([, references]) => references.get(noteId)?.has(filename))
      .map(([sourceId]) => sourceId);
    if (sourceIds.length) {
      // Project access has already been checked by the route. Do not disclose
      // even IDs of references in other projects, whether or not they block us.
      const remainingReferences: Array<{ noteId: string }> = [];
      for (const sourceId of sourceIds) {
        const source = await MetadataRepository.getNoteMetadata(sourceId, tx);
        if (source?.projectId === projectId) remainingReferences.push({ noteId: sourceId });
      }
      return { deleted: false, blocked: true, remainingReferences };
    }

    let etag: string;
    try {
      ({ etag } = await RustFS.statFile(target.bucketPath, filename));
    } catch (error: any) {
      if (error.code === 'ENOENT' || error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return { deleted: false, blocked: false, remainingReferences: [] };
      }
      throw error;
    }
    if (!etag) throw new Error('Deletion blocked: missing object version');
    // Match cleanup's fresh inventory and object-version precondition.
    const fresh = await deletionInventory(target, tx);
    if (fresh.referenced.get(noteId)?.has(filename)) {
      return { deleted: false, blocked: true, remainingReferences: [] };
    }
    await RustFS.deleteFile(target.bucketPath, filename, etag);
    return { deleted: true, blocked: false, remainingReferences: [] };
  });
}

// A save queued behind deletion must not publish a now-broken media URL. Check
// while holding the same lock used by explicit deletion, before pointer commit.
export class MediaReferenceUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Note media references are unavailable; refresh the note and try again.', options);
  }
}

export async function validateMediaReferences(body: string, tx: NoteTransaction) {
  try {
    for (const [id, files] of parseMediaReferences(body)) {
      const source = await MetadataRepository.getNoteMetadata(id, tx);
      if (!source) throw new Error('Reference source no longer exists');
      for (const filename of files) await RustFS.statFile(source.bucketPath, filename);
    }
  } catch (cause) {
    // Never return foreign note IDs, filenames, or storage diagnostics.
    throw new MediaReferenceUnavailableError({ cause });
  }
}
