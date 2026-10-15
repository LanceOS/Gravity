import { noteBucketCleanups } from '../schema.js';
import { recoverDeletedNoteBuckets } from './deleted-note-cleanup.js';
import { randomUUID } from 'node:crypto';
import { withNoteReferenceLock } from '../reference-lock.js';
import type { NoteTransaction } from '../reference-lock.js';
import { MetadataRepository, NotesRepository, NoteRevisionRepository } from '../repositories.js';
import { RustFS } from '../../../lib/rustfs.js';
import { db } from '../../../db/index.js';
import { cleanupMedia, type CleanupOptions, type MediaCleanupDependencies } from './media-cleanup.js';
import { assertNoteAttachmentsUnshared, validateMediaReferences } from './media-deletion.js';
import { noteExcerpt, noteSearchText } from '../search-text.js';
import { authorizedNote, authorizedNoteAccess, canAccessNote, currentNoteActor, NoteAccessDeniedError, requireCurrentNoteActor, type NoteActor } from './access.js';

type NoteMetadata = NonNullable<Awaited<ReturnType<typeof MetadataRepository.getNoteMetadata>>>;

// HTTP and other user-initiated callers use the ForActor entry points. The
// explicitly named unchecked operations are for internal maintenance/tests.

export type NoteCleanupDependencies = MediaCleanupDependencies & {
  getMetadata: (id: string) => Promise<NoteMetadata | null>;
};

export async function createNoteUnchecked(
  projectId: string,
  userId: string,
  title: string,
  body: string,
  visibility: 'private' | 'shared' = 'private',
  authorizeCommit?: (tx: NoteTransaction) => Promise<void>,
) {
  const noteUuid = randomUUID();
  const noteId = `note-${noteUuid}`;
  const bucketPath = RustFS.getBucketPath(projectId, userId, noteUuid);
  const searchText = noteSearchText(body);
  const excerpt = noteExcerpt(searchText);

  const bodyKey = `.revisions/${randomUUID()}.md`;
  await NoteRevisionRepository.stage(bucketPath, bodyKey);
  let metadata;
  try {
    await NotesRepository.saveBody(bucketPath, body, bodyKey);
    metadata = await MetadataRepository.createNoteMetadata({
      id: noteId, projectId, userId, visibility, title, excerpt, searchText, bucketPath, bodyKey,
    }, async tx => { await authorizeCommit?.(tx); await validateMediaReferences(body, tx); });
  } catch (err) {
    await discardRevision(bodyKey);
    throw err;
  }

  const { searchText: _searchText, ...publicMetadata } = metadata;
  return { ...publicMetadata, body };
}

export async function createNoteForActor(
  projectId: string, actor: NoteActor, title: string, body: string,
  visibility: 'private' | 'shared' = 'private',
) {
  await requireCurrentNoteActor(projectId, actor);
  const note = await createNoteUnchecked(projectId, actor.userId, title, body, visibility, async tx => {
    if (!await currentNoteActor(projectId, actor.userId, tx, true)) throw new NoteAccessDeniedError();
  });
  return { ...note, canManage: true };
}

export async function getNoteUnchecked(noteId: string, projectId: string) {
  const metadata = await MetadataRepository.getNoteMetadata(noteId);
  if (!metadata || metadata.projectId !== projectId) {
    return null;
  }

  return readNote(metadata);
}

async function readNote(metadata: NoteMetadata) {
  try {
    const body = await NotesRepository.getBody(metadata.bucketPath, metadata.bodyKey);
    const { searchText: _searchText, ...publicMetadata } = metadata;
    return { ...publicMetadata, body };
  } catch (err: any) {
    if (err.code === 'ENOENT' && metadata.bodyKey === 'body.md') {
      const { searchText: _searchText, ...publicMetadata } = metadata;
      return { ...publicMetadata, body: '' }; // Fallback if file is missing somehow
    }
    throw err;
  }
}

export async function getNoteForActor(noteId: string, projectId: string, actor: NoteActor) {
  const access = await authorizedNoteAccess(noteId, projectId, actor, 'read');
  return access ? { ...await readNote(access.note), canManage: canAccessNote(access.note, access.actor, 'manage') } : null;
}

export async function updateNoteUnchecked(
  noteId: string,
  projectId: string,
  currentVersion: number,
  updates: { title?: string; body?: string; visibility?: 'private' | 'shared' },
  authorizeCommit?: (tx: NoteTransaction) => Promise<void>,
) {
  const existing = await MetadataRepository.getNoteMetadata(noteId);
  if (!existing || existing.projectId !== projectId) {
    throw new Error('NOT_FOUND');
  }

  if (existing.version !== currentVersion) throw new Error('CONFLICT');
  const searchText = updates.body !== undefined ? noteSearchText(updates.body) : undefined;
  const newExcerpt = searchText !== undefined ? noteExcerpt(searchText) : existing.excerpt;
  const bodyKey = updates.body !== undefined ? `.revisions/${randomUUID()}.md` : undefined;
  let body = updates.body;
  // Read the captured immutable pointer before committing title-only changes.
  if (body === undefined) {
    try {
      body = await NotesRepository.getBody(existing.bucketPath, existing.bodyKey);
    } catch (err: any) {
      if (err.code === 'ENOENT' && existing.bodyKey === 'body.md') body = '';
      else throw err;
    }
  }
  if (bodyKey) await NoteRevisionRepository.stage(existing.bucketPath, bodyKey);
  let updatedMeta;
  try {
    if (bodyKey) await NotesRepository.saveBody(existing.bucketPath, body, bodyKey);
    updatedMeta = await MetadataRepository.updateNoteMetadata(noteId, currentVersion, {
      title: updates.title, visibility: updates.visibility, excerpt: newExcerpt, ...(searchText !== undefined ? { searchText } : {}), ...(bodyKey ? { bodyKey } : {}),
    }, async tx => { await authorizeCommit?.(tx); if (updates.body !== undefined) await validateMediaReferences(updates.body, tx); });
  } catch (err: any) {
    if (bodyKey) await discardRevision(bodyKey);
    if (err.message === 'NOTE_DELETED' || err.message === 'Note not found') throw new Error('NOT_FOUND');
    if (err.message.includes('Optimistic locking failed')) throw new Error('CONFLICT');
    throw err;
  }

  const { searchText: _searchText, ...publicMetadata } = updatedMeta;
  return { ...publicMetadata, body };
}

export async function updateNoteForActor(
  noteId: string, projectId: string, actor: NoteActor, currentVersion: number,
  updates: { title?: string; body?: string; visibility?: 'private' | 'shared' },
) {
  const action = updates.visibility === undefined ? 'write' : 'manage';
  if (!await authorizedNote(noteId, projectId, actor, action)) throw new Error('NOT_FOUND');
  const updated = await updateNoteUnchecked(noteId, projectId, currentVersion, updates, async tx => {
    const currentActor = await currentNoteActor(projectId, actor.userId, tx, true);
    const currentNote = await MetadataRepository.getNoteMetadata(noteId, tx);
    if (!currentActor || !currentNote || currentNote.projectId !== projectId || !canAccessNote(currentNote, currentActor, action)) throw new Error('NOT_FOUND');
  });
  const latestActor = await currentNoteActor(projectId, actor.userId);
  return { ...updated, canManage: !!latestActor && canAccessNote(updated, latestActor, 'manage') };
}

export async function deleteNoteUnchecked(noteId: string, projectId: string) {
  return deleteNoteInternal(noteId, projectId);
}

export async function deleteNoteForActor(noteId: string, projectId: string, actor: NoteActor) {
  return deleteNoteInternal(noteId, projectId, actor);
}

async function deleteNoteInternal(noteId: string, projectId: string, actor?: NoteActor) {
  const deleted = await withNoteReferenceLock(async tx => {
    const metadata = await MetadataRepository.getNoteMetadata(noteId, tx);
    const currentActor = actor ? await currentNoteActor(projectId, actor.userId, tx, true) : null;
    if (!metadata || metadata.projectId !== projectId || (actor && (!currentActor || !canAccessNote(metadata, currentActor, 'manage')))) return null;
    await assertNoteAttachmentsUnshared(metadata, tx);
    await tx.insert(noteBucketCleanups).values({ bucketPath: metadata.bucketPath, noteId });
    await MetadataRepository.deleteNoteMetadata(noteId, tx);
    return metadata;
  });
  if (!deleted) return false;

  // On an ambiguous commit acknowledgement this path is never reached. The
  // atomic ledger entry authorizes a later recovery run only if commit won.
  try {
    await recoverDeletedNoteBuckets({ bucketPath: deleted.bucketPath });
  } catch {
    console.error('Deleted note storage cleanup deferred', { noteId });
  }
  return true;
}

export async function listNotesUnchecked(projectId: string, userId: string, limit: number = 50, offset: number = 0, sortDirection: 'desc' | 'asc' = 'desc') {
  return await MetadataRepository.listNotesMetadata(projectId, userId, limit, offset, sortDirection);
}

export async function listNotesForActor(projectId: string, actor: NoteActor, limit: number = 50, offset: number = 0, sortDirection: 'desc' | 'asc' = 'desc') {
  return db.transaction(async tx => {
    if (!await currentNoteActor(projectId, actor.userId, tx, true)) throw new NoteAccessDeniedError();
    return MetadataRepository.listNotesMetadata(projectId, actor.userId, limit, offset, sortDirection, tx);
  });
}

export async function searchNotesUnchecked(projectId: string, userId: string, query: string, limit: number = 50, offset: number = 0, sortDirection: 'desc' | 'asc' = 'desc') {
  return await MetadataRepository.searchNotesMetadata(projectId, userId, query, limit, offset, sortDirection);
}

export async function searchNotesForActor(projectId: string, actor: NoteActor, query: string, limit: number = 50, offset: number = 0, sortDirection: 'desc' | 'asc' = 'desc') {
  return db.transaction(async tx => {
    if (!await currentNoteActor(projectId, actor.userId, tx, true)) throw new NoteAccessDeniedError();
    return MetadataRepository.searchNotesMetadata(projectId, actor.userId, query, limit, offset, sortDirection, tx);
  });
}

export class NoteCleanupService {
  private readonly dependencies: NoteCleanupDependencies;

  constructor(dependencies?: Partial<NoteCleanupDependencies>) {
    this.dependencies = {
      getMetadata: MetadataRepository.getNoteMetadata,
      listNotes: MetadataRepository.listNotesForMediaCleanup,
      getBody: NotesRepository.getBody,
      statFile: (bucket, file) => RustFS.statFile(bucket, file),
      listFiles: RustFS.listFiles,
      deleteFile: (bucket, file, etag) => RustFS.deleteFile(bucket, file, etag),
      ...dependencies,
    };
  }

  async cleanupNoteMedia(noteId: string, projectId: string, options: CleanupOptions = {}) {
    return this.cleanupNoteMediaInternal(noteId, projectId, options);
  }

  async cleanupNoteMediaForActor(noteId: string, projectId: string, actor: NoteActor, options: CleanupOptions = {}) {
    return this.cleanupNoteMediaInternal(noteId, projectId, options, actor);
  }

  private async cleanupNoteMediaInternal(noteId: string, projectId: string, options: CleanupOptions, actor?: NoteActor) {
    const metadata = await this.dependencies.getMetadata(noteId);
    const currentActor = actor ? await currentNoteActor(projectId, actor.userId) : null;
    if (!metadata || metadata.projectId !== projectId || (actor && (!currentActor || !canAccessNote(metadata, currentActor, 'manage')))) throw new Error('NOT_FOUND');
    const dependencies = actor ? {
      ...this.dependencies,
      authorizeTarget: async (tx: NoteTransaction) => {
        const latestActor = await currentNoteActor(projectId, actor.userId, tx, true);
        const latestNote = await MetadataRepository.getNoteMetadata(noteId, tx);
        if (!latestActor || !latestNote || latestNote.projectId !== projectId || latestNote.bucketPath !== metadata.bucketPath
          || !canAccessNote(latestNote, latestActor, 'manage')) throw new Error('NOT_FOUND');
      },
    } : this.dependencies;
    const result = await cleanupMedia(dependencies, options, metadata);
    if (actor) {
      const latestActor = await currentNoteActor(projectId, actor.userId);
      const latestNote = await MetadataRepository.getNoteMetadata(noteId);
      if (!latestActor || !latestNote || latestNote.projectId !== projectId || !canAccessNote(latestNote, latestActor, 'manage')) throw new Error('NOT_FOUND');
    }
    return {
      cleanedFiles: result.deleted.map(entry => entry.file),
      orphanedFiles: result.orphanedFound.map(entry => entry.file),
      deferredFiles: result.deferred.map(entry => entry.file),
      deadLinks: result.deadLinks,
    };
  }
}

const noteCleanupService = new NoteCleanupService();

export function createNoteCleanupService(dependencies?: Partial<NoteCleanupDependencies>) {
  return new NoteCleanupService(dependencies);
}

export async function cleanupNoteMediaUnchecked(noteId: string, projectId: string, options: CleanupOptions = {}) {
  return noteCleanupService.cleanupNoteMedia(noteId, projectId, options);
}

export async function cleanupNoteMediaForActor(noteId: string, projectId: string, actor: NoteActor, options: CleanupOptions = {}) {
  return noteCleanupService.cleanupNoteMediaForActor(noteId, projectId, actor, options);
}

// Never delete on an ambiguous DB failure alone: the transaction may have
// committed. Only a durable abandonment claim authorizes object deletion.
async function discardRevision(bodyKey: string): Promise<void> {
  try {
    const revision = await NoteRevisionRepository.abandon(bodyKey);
    if (revision) await NotesRepository.deleteFile(revision.bucketPath, revision.bodyKey);
  } catch (error) {
    console.error('Note revision cleanup deferred to recovery.');
  }
}

export async function recoverAbandonedNoteRevisions(dryRun = false, cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  const candidates = await NoteRevisionRepository.recoveryCandidates(cutoff);
  if (dryRun) return candidates;
  for (const candidate of candidates) {
    const revision = await NoteRevisionRepository.abandon(candidate.bodyKey);
    if (revision) await NotesRepository.deleteFile(revision.bucketPath, revision.bodyKey);
  }
  // Keep abandonment tombstones: a timed-out upload can still finish after
  // deletion. Later recovery runs delete those objects again, never publish them.
  return candidates;
}
