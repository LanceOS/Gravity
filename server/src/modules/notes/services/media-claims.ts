import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, ne } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { RustFS } from '../../../lib/rustfs.js';
import { withNoteReferenceLock, type NoteTransaction } from '../reference-lock.js';
import { noteMediaDeletions } from '../schema.js';

const RETRY_MS = 60_000;
const QUIET_RECHECK_MS = 24 * 60 * 60 * 1000;
const STORAGE_REQUEST_TIMEOUT_MS = 30_000;

async function withStorageDeadline<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Media deletion storage request timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getMediaDeletionClaim(bucketPath: string, filename: string, executor: typeof db | NoteTransaction) {
  const [claim] = await executor.select().from(noteMediaDeletions).where(and(
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
      noteId, etag, claimId, status: 'pending', attempts: 0, lastError: null, nextAttemptAt, updatedAt: new Date(),
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
  options: { lockDuringDelete?: boolean; requestTimeoutMs?: number } = {},
) {
  const finish = async (tx: NoteTransaction, failed: boolean, failure?: unknown) => {
    const claim = await getMediaDeletionClaim(bucketPath, filename, tx);
    // Recovery may have retried this pending claim while an unlocked request
    // was still in flight. Never confirm it after recovery marks it ambiguous.
    if (!claim || claim.claimId !== claimId || claim.status !== 'pending') return { completed: false, failed: false };
    await tx.update(noteMediaDeletions).set({
      status: failed ? 'ambiguous' : 'confirmed',
      attempts: claim.attempts + 1,
      lastError: failed ? 'OBJECT_DELETE_UNCONFIRMED' : null,
      nextAttemptAt: new Date(Date.now() + (failed ? RETRY_MS : QUIET_RECHECK_MS)),
      updatedAt: new Date(),
    }).where(and(eq(noteMediaDeletions.bucketPath, bucketPath), eq(noteMediaDeletions.filename, filename)));
    return { completed: !failed, failed, failure };
  };
  const attempt = async (etag: string) => {
    try {
      await withStorageDeadline(() => deleteFile(bucketPath, filename, etag), options.requestTimeoutMs ?? STORAGE_REQUEST_TIMEOUT_MS);
      return { failed: false, failure: undefined };
    } catch (failure) {
      return { failed: true, failure };
    }
  };
  let outcome: Awaited<ReturnType<typeof finish>>;
  if (options.lockDuringDelete === false) {
    const claim = await getMediaDeletionClaim(bucketPath, filename, db);
    if (!claim || claim.claimId !== claimId || claim.status !== 'pending') return false;
    // The committed claim fences publication while this RPC runs. Its final
    // state is still serialized with recovery and upload under the lock.
    const result = await attempt(claim.etag);
    outcome = await withNoteReferenceLock(tx => finish(tx, result.failed, result.failure));
  } else {
    outcome = await withNoteReferenceLock(async tx => {
      const claim = await getMediaDeletionClaim(bucketPath, filename, tx);
      if (!claim || claim.claimId !== claimId || claim.status !== 'pending') return { completed: false, failed: false };
      const result = await attempt(claim.etag);
      return finish(tx, result.failed, result.failure);
    });
  }
  if (outcome.failed) throw outcome.failure;
  return outcome.completed;
}

/** A pending claim may represent a process lost while DELETE was still in flight.
 * Recovery retries the original ETag, but never declares that old request over.
 */
export async function recoverMediaDeletionClaims(options: { dryRun?: boolean; now?: Date; requestTimeoutMs?: number } = {}) {
  const now = options.now ?? new Date();
  const candidates = await db.select().from(noteMediaDeletions).where(and(
    ne(noteMediaDeletions.status, 'confirmed'), lte(noteMediaDeletions.nextAttemptAt, now),
  )).orderBy(asc(noteMediaDeletions.nextAttemptAt)).limit(20);
  if (options.dryRun) return candidates;
  const results = [];
  for (const candidate of candidates) {
    // Persist the recovery attempt before storage I/O. This prevents a slow
    // original DELETE from confirming the claim after recovery has started,
    // and keeps long HEAD/DELETE requests outside the global note lock.
    const started = await withNoteReferenceLock(async tx => {
      const claim = await getMediaDeletionClaim(candidate.bucketPath, candidate.filename, tx);
      if (!claim || claim.claimId !== candidate.claimId || claim.status === 'confirmed' || claim.nextAttemptAt > now) return null;
      const [updated] = await tx.update(noteMediaDeletions).set({
        status: 'ambiguous', attempts: claim.attempts + 1,
        lastError: 'RECOVERY_IN_PROGRESS',
        nextAttemptAt: new Date(now.getTime() + RETRY_MS), updatedAt: now,
      }).where(and(eq(noteMediaDeletions.bucketPath, claim.bucketPath), eq(noteMediaDeletions.filename, claim.filename))).returning();
      return updated;
    });
    if (!started) continue;
    let error: string | null = null;
    try {
      const current = await withStorageDeadline(
        () => RustFS.statFile(started.bucketPath, started.filename), options.requestTimeoutMs ?? STORAGE_REQUEST_TIMEOUT_MS,
      );
      if (current.etag === started.etag) await withStorageDeadline(
        () => RustFS.deleteFile(started.bucketPath, started.filename, started.etag), options.requestTimeoutMs ?? STORAGE_REQUEST_TIMEOUT_MS,
      );
      else error = 'OBJECT_VERSION_CHANGED';
    } catch (cause: any) {
      if (cause.code !== 'ENOENT' && cause.name !== 'NotFound' && cause.name !== 'NoSuchKey') {
        error = 'OBJECT_DELETE_UNCONFIRMED';
      }
    }
    const result = await withNoteReferenceLock(async tx => {
      const claim = await getMediaDeletionClaim(started.bucketPath, started.filename, tx);
      if (!claim || claim.claimId !== started.claimId || claim.attempts !== started.attempts || claim.status !== 'ambiguous') return null;
      // Even a successful retry cannot prove an earlier timed-out DELETE ended.
      const [updated] = await tx.update(noteMediaDeletions).set({
        lastError: error,
        nextAttemptAt: new Date(now.getTime() + (error === 'OBJECT_DELETE_UNCONFIRMED' ? RETRY_MS : QUIET_RECHECK_MS)),
        updatedAt: now,
      }).where(and(eq(noteMediaDeletions.bucketPath, claim.bucketPath), eq(noteMediaDeletions.filename, claim.filename))).returning();
      return updated;
    });
    if (result) results.push(result);
  }
  return results;
}
