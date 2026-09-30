import { recoverDeletedNoteBuckets } from '../modules/notes/services/deleted-note-cleanup.js';
import { fileURLToPath } from 'node:url';
import { recoverAbandonedNoteRevisions } from '../modules/notes/services/notes.js';
import { RustFS } from '../lib/rustfs.js';
import { MetadataRepository, NotesRepository } from '../modules/notes/repositories.js';
import { cleanupMedia, type CleanupOptions } from '../modules/notes/services/media-cleanup.js';

async function runCleanup(dryRun = false, options: Omit<CleanupOptions, 'dryRun'> = {}) {
  const deletedNoteBuckets = await recoverDeletedNoteBuckets({ dryRun });
  const media = await cleanupMedia({
    listNotes: MetadataRepository.listNotesForMediaCleanup,
    getBody: NotesRepository.getBody,
    listFiles: bucket => RustFS.listFiles(bucket),
    statFile: (bucket, file) => RustFS.statFile(bucket, file),
    deleteFile: (bucket, file, etag) => RustFS.deleteFile(bucket, file, etag),
  }, { ...options, dryRun });
  const abandonedRevisions = await recoverAbandonedNoteRevisions(dryRun);
  return { ...media, abandonedRevisions, deletedNoteBuckets };
}

if (import.meta.url) {
  const __filename = fileURLToPath(import.meta.url);
  if (process.argv[1] === __filename) {
    const dry = process.argv.includes('--dry-run');
    runCleanup(dry, { gracePeriodMs: process.env.NOTE_MEDIA_GRACE_MS === undefined ? undefined : Number(process.env.NOTE_MEDIA_GRACE_MS) })
      .then((res) => {
        console.log('Cleanup complete.', res);
        process.exit(0);
      })
      .catch((err) => {
        console.error('Cleanup failed:', err);
        process.exit(2);
      });
  }
}

export { runCleanup };
