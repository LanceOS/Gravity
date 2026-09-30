import { and, asc, eq, lte, or } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { RustFS } from '../../../lib/rustfs.js';
import { noteBucketCleanups, noteMetadata } from '../schema.js';
import { withNoteReferenceLock } from '../reference-lock.js';

const RETRY_MS = 60_000;
const RESWEEP_MS = 24 * 60 * 60 * 1000;

/** At most 20 prefixes and 100 objects per prefix per invocation. Tombstones
 * remain permanently: uploads already in flight can land after a successful sweep.
 * All publication checks the tombstone under the same metadata mutation lock.
 */
export async function recoverDeletedNoteBuckets(options: { dryRun?: boolean; bucketPath?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const candidates = await db.select().from(noteBucketCleanups)
    .where(and(lte(noteBucketCleanups.nextAttemptAt, now), options.bucketPath
      ? eq(noteBucketCleanups.bucketPath, options.bucketPath) : undefined))
    .orderBy(asc(noteBucketCleanups.nextAttemptAt), asc(noteBucketCleanups.bucketPath)).limit(20);
  if (options.dryRun) return candidates;
  const results = [];
  for (const candidate of candidates) {
    const result = await withNoteReferenceLock(async tx => {
      const [intent] = await tx.select().from(noteBucketCleanups)
        .where(eq(noteBucketCleanups.bucketPath, candidate.bucketPath)).for('update');
      if (!intent || intent.nextAttemptAt > now) return null;
      const [survivor] = await tx.select({ id: noteMetadata.id }).from(noteMetadata)
        .where(or(eq(noteMetadata.id, intent.noteId), eq(noteMetadata.bucketPath, intent.bucketPath))).limit(1);
      let status = 'blocked';
      let lastError: string | null = 'LIVE_NOTE';
      if (!survivor) {
        try {
          const page = await RustFS.listDeletedBucketPage(intent.bucketPath);
          for (const file of page.files) await RustFS.deleteFile(intent.bucketPath, file);
          status = page.more ? 'pending' : 'clean';
          lastError = null;
        } catch {
          status = 'retry';
          lastError = 'OBJECT_CLEANUP_FAILED';
          console.error('Deleted note storage cleanup failed', { noteId: intent.noteId });
        }
      }
      const [updated] = await tx.update(noteBucketCleanups).set({
        status, lastError, attempts: intent.attempts + 1, updatedAt: now,
        nextAttemptAt: new Date(now.getTime() + (status === 'clean' ? RESWEEP_MS : RETRY_MS)),
      }).where(eq(noteBucketCleanups.bucketPath, intent.bucketPath)).returning();
      return updated;
    });
    if (result) results.push(result);
  }
  return results;
}
