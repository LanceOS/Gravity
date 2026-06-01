import { randomUUID } from 'node:crypto';
import { MetadataRepository, NotesRepository } from '../repositories.js';
import { RustFS } from '../../../lib/rustfs.js';

export async function createNote(
  projectId: string,
  userId: string,
  title: string,
  body: string
) {
  const noteUuid = randomUUID();
  const noteId = `note-${noteUuid}`;
  const bucketPath = RustFS.getBucketPath(projectId, userId, noteUuid);

  // Two-phase save: Create metadata first, then save body
  const metadata = await MetadataRepository.createNoteMetadata({
    id: noteId,
    projectId,
    userId,
    title,
    bucketPath,
  });

  try {
    await NotesRepository.saveBody(bucketPath, body);
  } catch (err) {
    // If saving the body fails, rollback the metadata to keep consistency
    await MetadataRepository.deleteNoteMetadata(noteId);
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
    const body = await NotesRepository.getBody(metadata.bucketPath);
    return { ...metadata, body };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
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

  // Update metadata (optimistic locking enforced inside MetadataRepository)
  let updatedMeta;
  try {
    updatedMeta = await MetadataRepository.updateNoteMetadata(noteId, currentVersion, {
      title: updates.title,
    });
  } catch (err: any) {
    if (err.message.includes('Optimistic locking failed')) {
      throw new Error('CONFLICT');
    }
    throw err;
  }

  // If body is provided, overwrite the RustFS content
  if (updates.body !== undefined) {
    await NotesRepository.saveBody(existing.bucketPath, updates.body);
  }

  // Fetch updated body to return the complete object
  let body = updates.body;
  if (body === undefined) {
    try {
      body = await NotesRepository.getBody(existing.bucketPath);
    } catch (e: any) {
      if (e.code === 'ENOENT') body = '';
      else throw e;
    }
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

export async function listNotes(projectId: string, userId: string, limit: number = 50, offset: number = 0) {
  return await MetadataRepository.listNotesMetadata(projectId, userId, limit, offset);
}
