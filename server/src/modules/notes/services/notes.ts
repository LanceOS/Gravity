import { randomUUID } from 'node:crypto';
import { MetadataRepository, NotesRepository, NoteRevisionRepository, isNoteBodyFile } from '../repositories.js';
import { RustFS } from '../../../lib/rustfs.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type NoteMetadata = NonNullable<Awaited<ReturnType<typeof MetadataRepository.getNoteMetadata>>>;

export type NoteCleanupDependencies = {
  getMetadata: (id: string) => Promise<NoteMetadata | null>;
  getBody: (bucketPath: string, bodyKey?: string) => Promise<string>;
  listFiles: (bucketPath: string) => Promise<string[]>;
  deleteFile: (bucketPath: string, filename: string) => Promise<void>;
};

function extractRichTextExcerpt(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (!isRecord(parsed) || parsed.type !== 'doc' || !Array.isArray(parsed.content)) {
      return null;
    }

    const fragments: string[] = [];

    const visit = (node: unknown) => {
      if (typeof node === 'string') {
        fragments.push(node);
        return;
      }

      if (!isRecord(node)) {
        return;
      }

      if (typeof node.text === 'string' && node.text.length > 0) {
        fragments.push(node.text);
      }

      if (node.type === 'hard_break') {
        fragments.push(' ');
      }

      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          visit(child);
        }
      }
    };

    for (const child of parsed.content) {
      visit(child);
    }

    return fragments.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

function extractExcerpt(body: string, maxLength: number = 500): string {
  const richTextExcerpt = extractRichTextExcerpt(body);
  if (richTextExcerpt !== null) {
    return richTextExcerpt.length > maxLength
      ? `${richTextExcerpt.substring(0, maxLength)}...`
      : richTextExcerpt;
  }

  // Strip simple markdown formatting for legacy note bodies.
  const plainText = body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[#*`_~]/g, '') // formatting
    .replace(/\n+/g, ' ') // newlines
    .trim();
  
  return plainText.length > maxLength 
    ? plainText.substring(0, maxLength) + '...'
    : plainText;
}

export async function createNote(
  projectId: string,
  userId: string,
  title: string,
  body: string
) {
  const noteUuid = randomUUID();
  const noteId = `note-${noteUuid}`;
  const bucketPath = RustFS.getBucketPath(projectId, userId, noteUuid);
  const excerpt = extractExcerpt(body);

  const bodyKey = `.revisions/${randomUUID()}.md`;
  await NoteRevisionRepository.stage(bucketPath, bodyKey);
  let metadata;
  try {
    await NotesRepository.saveBody(bucketPath, body, bodyKey);
    metadata = await MetadataRepository.createNoteMetadata({
      id: noteId, projectId, userId, title, excerpt, bucketPath, bodyKey,
    });
  } catch (err) {
    await discardRevision(bodyKey);
    throw err;
  }

  return { ...metadata, body };
}

export async function getNote(noteId: string, projectId: string) {
  const metadata = await MetadataRepository.getNoteMetadata(noteId);
  if (!metadata || metadata.projectId !== projectId) {
    return null;
  }

  try {
    const body = await NotesRepository.getBody(metadata.bucketPath, metadata.bodyKey);
    return { ...metadata, body };
  } catch (err: any) {
    if (err.code === 'ENOENT' && metadata.bodyKey === 'body.md') {
      return { ...metadata, body: '' }; // Fallback if file is missing somehow
    }
    throw err;
  }
}

export async function updateNote(
  noteId: string,
  projectId: string,
  currentVersion: number,
  updates: { title?: string; body?: string }
) {
  const existing = await MetadataRepository.getNoteMetadata(noteId);
  if (!existing || existing.projectId !== projectId) {
    throw new Error('NOT_FOUND');
  }

  if (existing.version !== currentVersion) throw new Error('CONFLICT');
  const newExcerpt = updates.body !== undefined ? extractExcerpt(updates.body) : existing.excerpt;
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
      title: updates.title, excerpt: newExcerpt, ...(bodyKey ? { bodyKey } : {}),
    });
  } catch (err: any) {
    if (bodyKey) await discardRevision(bodyKey);
    if (err.message.includes('Optimistic locking failed')) throw new Error('CONFLICT');
    throw err;
  }

  return { ...updatedMeta, body };
}

export async function deleteNote(noteId: string, projectId: string) {
  const metadata = await MetadataRepository.getNoteMetadata(noteId);
  if (!metadata || metadata.projectId !== projectId) {
    return false;
  }

  await NotesRepository.deleteBucket(metadata.bucketPath);
  await MetadataRepository.deleteNoteMetadata(noteId);
  return true;
}

export async function listNotes(projectId: string, userId: string, limit: number = 50, offset: number = 0, sortDirection: 'desc' | 'asc' = 'desc') {
  return await MetadataRepository.listNotesMetadata(projectId, userId, limit, offset, sortDirection);
}

export async function searchNotes(projectId: string, userId: string, query: string, limit: number = 50, offset: number = 0, sortDirection: 'desc' | 'asc' = 'desc') {
  return await MetadataRepository.searchNotesMetadata(projectId, userId, query, limit, offset, sortDirection);
}

export class NoteCleanupService {
  private readonly dependencies: NoteCleanupDependencies;

  constructor(dependencies?: Partial<NoteCleanupDependencies>) {
    this.dependencies = {
      getMetadata: MetadataRepository.getNoteMetadata,
      getBody: NotesRepository.getBody,
      listFiles: RustFS.listFiles,
      deleteFile: NotesRepository.deleteFile,
      ...dependencies,
    };
  }

  async cleanupNoteMedia(noteId: string, projectId: string): Promise<{
    cleanedFiles: string[];
    deadLinks: string[];
  }> {
    const metadata = await this.dependencies.getMetadata(noteId);
    if (!metadata || metadata.projectId !== projectId) {
      throw new Error('NOT_FOUND');
    }

    let body = '';
    try {
      body = await this.dependencies.getBody(metadata.bucketPath, metadata.bodyKey);
    } catch (e: any) {
      if (e.code !== 'ENOENT' || metadata.bodyKey !== 'body.md') throw e;
    }

    const allFiles = await this.dependencies.listFiles(metadata.bucketPath);
    const mediaFiles = allFiles.filter((f) => !isNoteBodyFile(f));
    const mediaFileSet = new Set(mediaFiles);

    // Find all file references in the body (e.g. /api/v1/notes/:noteId/media/:filename)
    const referencePattern = new RegExp(`/api/v1/notes/${noteId}/media/([^\\s)"]+)`, 'g');
    const referencedFiles = new Set<string>();
    let match;
    while ((match = referencePattern.exec(body)) !== null) {
      try {
        referencedFiles.add(decodeURIComponent(match[1]));
      } catch {
        referencedFiles.add(match[1]);
      }
    }

    const orphanedFiles = mediaFiles.filter((file) => !referencedFiles.has(file));
    const deadLinks = [...referencedFiles].filter((file) => !mediaFileSet.has(file));

    // Keep deletion concurrency bounded even for multi-page inventories.
    for (const file of orphanedFiles) {
      await this.dependencies.deleteFile(metadata.bucketPath, file);
    }

    return {
      cleanedFiles: orphanedFiles,
      deadLinks,
    };
  }
}

const noteCleanupService = new NoteCleanupService();

export function createNoteCleanupService(dependencies?: Partial<NoteCleanupDependencies>) {
  return new NoteCleanupService(dependencies);
}

export async function cleanupNoteMedia(noteId: string, projectId: string) {
  return noteCleanupService.cleanupNoteMedia(noteId, projectId);
}

// Never delete on an ambiguous DB failure alone: the transaction may have
// committed. Only a durable abandonment claim authorizes object deletion.
async function discardRevision(bodyKey: string): Promise<void> {
  try {
    const revision = await NoteRevisionRepository.abandon(bodyKey);
    if (revision) await NotesRepository.deleteFile(revision.bucketPath, revision.bodyKey);
  } catch (error) {
    console.error('Note revision cleanup deferred to recovery:', error);
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
