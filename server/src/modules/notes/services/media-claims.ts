import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, ne } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { RustFS } from '../../../lib/rustfs.js';
import { withNoteReferenceLock, type NoteTransaction } from '../reference-lock.js';
import { noteMediaDeletions } from '../schema.js';

const RETRY_MS = 60_000;
const QUIET_RECHECK_MS = 24 * 60 * 60 * 1000;

export async function getMediaDeletionClaim(bucketPath: string, filename: string, tx: NoteTransaction) {
  const [claim] = await tx.select().from(noteMediaDeletions).where(and(
    eq(noteMediaDeletions.bucketPath, bucketPath), eq(noteMediaDeletions.filename, filename),
  )).limit(1);
  return claim ?? null;
}

/** Called only after a complete reference scan under the note mutation lock. */
export async function createMediaDeletionClaim(
  noteId: string, bucketPath: string, filename: string, etag: string, tx: NoteTransaction,
): Promise<string | null> {
  const existing = await getMediaDeletionClaim(bucketPath, filename, tx);
  if (existing && existing.status !== 'confirmed') return null;
  const claimId = randomUUID();
  const nextAttemptAt = new Date(Date.now() + RETRY_MS);
  if (existing) {
    // A confirmed request is over. A late PUT may have made the key orphaned
    // again, so the next deletion gets a fresh durable claim generation.
    await tx.update(noteMediaDeletions).set({
      noteId, etag, claimId, status: 'pending', attempts: 0, nextAttemptAt, updatedAt: new Date(),
    }).where(and(eq(noteMediaDeletions.bucketPath, bucketPath), eq(noteMediaDeletions.filename, filename)));
  } else {
    await tx.insert(noteMediaDeletions).values({ noteId, bucketPath, filename, etag, claimId, nextAttemptAt });
  }
  return claimId;
}

/** The claim was committed before calling this. A lost connection leaves it for recovery. */
export async function deleteClaimedMedia(
  bucketPath: string, filename: string, claimId: string,
  deleteFile: (bucket: string, file: string, etag: string) => Promise<void> = RustFS.deleteFile.bind(RustFS),
) {
  const outcome = await withNoteReferenceLock(async tx => {
    const claim = await getMediaDeletionClaim(bucketPath, filename, tx);
    if (!claim || claim.claimId !== claimId || claim.status !== 'pending') return { completed: false, failed: false };
    let failure: unknown;
    let failed = false;
    try {
      await deleteFile(bucketPath, filename, claim.etag);
    } catch (error) {
      failed = true;
      failure = error;
    }
    await tx.update(noteMediaDeletions).set({
      status: failed ? 'ambiguous' : 'confirmed',
      attempts: claim.attempts + 1,
      nextAttemptAt: new Date(Date.now() + (failed ? RETRY_MS : QUIET_RECHECK_MS)),
      updatedAt: new Date(),
    }).where(and(eq(noteMediaDeletions.bucketPath, bucketPath), eq(noteMediaDeletions.filename, filename)));
    return { completed: !failed, failed, failure };
  });
  if (outcome.failed) throw outcome.failure;
  return outcome.completed;
}

/** A pending claim may represent a process lost while DELETE was still in flight.
 * Recovery retries the original ETag, but never declares that old request over.
 */
export async function recoverMediaDeletionClaims(options: { dryRun?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const candidates = await db.select().from(noteMediaDeletions).where(and(
    ne(noteMediaDeletions.status, 'confirmed'), lte(noteMediaDeletions.nextAttemptAt, now),
  )).orderBy(asc(noteMediaDeletions.nextAttemptAt)).limit(20);
  if (options.dryRun) return candidates;
  const results = [];
  for (const candidate of candidates) {
    const result = await withNoteReferenceLock(async tx => {
      const claim = await getMediaDeletionClaim(candidate.bucketPath, candidate.filename, tx);
      if (!claim || claim.claimId !== candidate.claimId || claim.status === 'confirmed' || claim.nextAttemptAt > now) return null;
      let error: string | null = null;
      try {
        const current = await RustFS.statFile(claim.bucketPath, claim.filename);
        if (current.etag === claim.etag) await RustFS.deleteFile(claim.bucketPath, claim.filename, claim.etag);
        else error = 'OBJECT_VERSION_CHANGED';
      } catch (cause: any) {
        if (cause.code !== 'ENOENT' && cause.name !== 'NotFound' && cause.name !== 'NoSuchKey') {
          error = 'OBJECT_DELETE_UNCONFIRMED';
        }
      }
      // Even a successful retry cannot prove an earlier timed-out DELETE ended.
      const [updated] = await tx.update(noteMediaDeletions).set({
        status: 'ambiguous', attempts: claim.attempts + 1,
        nextAttemptAt: new Date(now.getTime() + (error ? RETRY_MS : QUIET_RECHECK_MS)),
        updatedAt: now,
      }).where(and(eq(noteMediaDeletions.bucketPath, claim.bucketPath), eq(noteMediaDeletions.filename, claim.filename))).returning();
      return updated;
    });
    if (result) results.push(result);
  }
  return results;
}
