import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/index.js';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { noteMetadata } from '../src/modules/notes/schema.js';
import { RustFS } from '../src/lib/rustfs.js';
import { eq } from 'drizzle-orm';

describe('Notes Storage Layer Integration', () => {
  const projectId = 'test-proj';
  const userId = 'test-user';
  const noteUuid = 'test-uuid-1234';
  const noteId = `note-${noteUuid}`;
  const bucketPath = RustFS.getBucketPath(projectId, userId, noteUuid);

  beforeAll(async () => {
    // Clean up before test
    await db.delete(noteMetadata).where(eq(noteMetadata.id, noteId));
    await NotesRepository.deleteBucket(bucketPath);
  });

  afterAll(async () => {
    // Clean up after test
    await db.delete(noteMetadata).where(eq(noteMetadata.id, noteId));
    await NotesRepository.deleteBucket(bucketPath);
  });

  it('should run a complete roundtrip of metadata and file content', async () => {
    // 1. Create metadata in Postgres
    const meta = await MetadataRepository.createNoteMetadata({
      id: noteId,
      projectId,
      userId,
      title: 'My test note',
      bucketPath,
    });

    expect(meta.id).toBe(noteId);
    expect(meta.projectId).toBe(projectId);
    expect(meta.version).toBe(1);

    // 2. Save a markdown body and an attached file via NotesRepository
    const bodyContent = '# Hello World\nThis is a test.';
    await NotesRepository.saveBody(bucketPath, bodyContent);

    const attachContent = 'binary data or text';
    await NotesRepository.saveAttachment(bucketPath, 'image.png', attachContent);

    // 3. Retrieve the contents successfully
    const retrievedBody = await NotesRepository.getBody(bucketPath);
    expect(retrievedBody).toBe(bodyContent);

    const retrievedAttach = await NotesRepository.getAttachment(bucketPath, 'image.png');
    expect(retrievedAttach.toString()).toBe(attachContent);

    // 4. Verify optimistic locking
    const updatedMeta = await MetadataRepository.updateNoteMetadata(noteId, meta.version, {
      title: 'Updated title',
    });
    expect(updatedMeta.title).toBe('Updated title');
    expect(updatedMeta.version).toBe(2);

    // Update with a stale version should fail
    await expect(
      MetadataRepository.updateNoteMetadata(noteId, meta.version, { title: 'Fails' })
    ).rejects.toThrow('Optimistic locking failed or note not found');

    // 5. List metadata with pagination
    const list = await MetadataRepository.listNotesMetadata(projectId, userId);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(n => n.id === noteId)).toBe(true);

    // 6. Delete file and check
    await NotesRepository.deleteFile(bucketPath, 'image.png');
    await expect(NotesRepository.getAttachment(bucketPath, 'image.png')).rejects.toThrow();

    // 7. Delete metadata
    await MetadataRepository.deleteNoteMetadata(noteId);
    const getDeleted = await MetadataRepository.getNoteMetadata(noteId);
    expect(getDeleted).toBeNull();
  });
});
