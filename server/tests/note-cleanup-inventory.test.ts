import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_LISTED_FILES, MAX_LISTED_KEY_BYTES } from '../src/lib/object-list-limits.js';
import { runCleanup } from '../src/jobs/cleanupOrphanedAssets.js';
import { RustFS } from '../src/lib/rustfs.js';
import { MetadataRepository } from '../src/modules/notes/repositories.js';
import { createNoteCleanupService } from '../src/modules/notes/services/notes.js';

async function seedNotes() {
  for (const id of ['first', 'second']) {
    await MetadataRepository.createNoteMetadata({ id, projectId: 'project', userId: 'user', title: id, bucketPath: `notes/${id}` });
  }
}

describe('cleanup inventory before deletion', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

  it('does not delete from earlier prefixes if a later inventory fails', async () => {
    await seedNotes();
    vi.spyOn(RustFS, 'readFileUtf8').mockResolvedValue('');
    let listings = 0;
    vi.spyOn(RustFS, 'listFiles').mockImplementation(async () => {
      if (++listings === 2) throw new Error('later page failed');
      return ['body.md', 'orphan.png'];
    });
    const remove = vi.spyOn(RustFS, 'deleteFile');
    await expect(runCleanup()).rejects.toThrow('later page failed');
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['count', 'bytes'])('rejects an oversized combined cleanup plan before deleting (%s)', async limit => {
    await seedNotes();
    vi.spyOn(RustFS, 'readFileUtf8').mockResolvedValue('');
    const filename = limit === 'bytes' ? 'é'.repeat(500) : 'file';
    const perPrefix = limit === 'count' ? MAX_LISTED_FILES / 2 + 1 : Math.ceil(MAX_LISTED_KEY_BYTES / 2000);
    vi.spyOn(RustFS, 'listFiles').mockResolvedValue(Array.from({ length: perPrefix }, (_, i) => `${i}-${filename}`));
    const remove = vi.spyOn(RustFS, 'deleteFile');
    await expect(runCleanup()).rejects.toThrow('Cleanup plan exceeded inventory limits');
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([false, true])('plans complete inventories, retains cross-note references, and honors dry run (%s)', async dryRun => {
    await seedNotes();
    vi.spyOn(RustFS, 'readFileUtf8').mockResolvedValue('![keep](/api/v1/notes/second/media/keep.png)');
    const list = vi.spyOn(RustFS, 'listFiles').mockImplementation(async bucket => bucket.endsWith('second')
      ? ['body.md', 'keep.png', 'later-page-orphan.png'] : ['body.md', 'orphan.png']);
    const remove = vi.spyOn(RustFS, 'deleteFile').mockImplementation(async () => { expect(list).toHaveBeenCalledTimes(2); });
    const result = await runCleanup(dryRun);
    expect(result.orphanedFound).toHaveLength(2);
    expect(result.orphanedFound.map(entry => entry.file)).not.toContain('keep.png');
    expect(remove).toHaveBeenCalledTimes(dryRun ? 0 : 2);
    expect(result.deleted).toHaveLength(dryRun ? 0 : 2);
  });

  it('does not delete or report dead links if the note inventory is incomplete', async () => {
    const remove = vi.fn();
    const service = createNoteCleanupService({
      getMetadata: async () => ({ id: 'note', projectId: 'project', bucketPath: 'notes/note' } as any),
      getBody: async () => '![asset](/api/v1/notes/note/media/later-page.png)',
      listFiles: async () => { throw new Error('listing interrupted'); },
      deleteFile: remove,
    });
    await expect(service.cleanupNoteMedia('note', 'project')).rejects.toThrow('listing interrupted');
    expect(remove).not.toHaveBeenCalled();
  });

  it('limits note cleanup to one deletion at a time for a large inventory', async () => {
    let inFlight = 0;
    let maximum = 0;
    const remove = vi.fn(async () => {
      maximum = Math.max(maximum, ++inFlight);
      await new Promise(resolve => setImmediate(resolve));
      --inFlight;
    });
    const service = createNoteCleanupService({
      getMetadata: async () => ({ id: 'note', projectId: 'project', bucketPath: 'notes/note' } as any),
      getBody: async () => '![keep](/api/v1/notes/note/media/keep.png)',
      listFiles: async () => ['body.md', ...Array.from({ length: 1001 }, (_, i) => `orphan-${i}.png`), 'keep.png'],
      deleteFile: remove,
    });
    const result = await service.cleanupNoteMedia('note', 'project');
    expect(maximum).toBe(1);
    expect(remove).toHaveBeenCalledTimes(1001);
    expect(result.deadLinks).toEqual([]);
    expect(result.cleanedFiles).not.toContain('keep.png');
  });
});
