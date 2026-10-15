import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Response } from 'express';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { authUsers } from '../../../db/schema.js';
import { RustFS } from '../../../lib/rustfs.js';
import { noteMetadata } from '../../notes/schema.js';
import { getWorkspaceMemberRole } from './membership.js';
import { parseMediaReferences } from '../../notes/services/media-cleanup.js';
import { projects, workspaceNoteExportEvents, workspaces } from '../schema.js';

const BATCH_SIZE = 100;
const CHUNK_BYTES = 48 * 1024;

type Diagnostic = {
  noteId: string;
  object: 'body' | 'attachment' | 'reference';
  filename?: string;
  reason: 'missing' | 'unavailable' | 'invalid_reference' | 'outside_workspace' | 'changed';
};

function isMissing(error: unknown) {
  return error instanceof Error && (
    ('code' in error && (error.code === 'ENOENT' || error.code === 'NoSuchKey'))
    || error.name === 'NotFound' || error.name === 'NoSuchKey'
    || ('statusCode' in error && error.statusCode === 404)
    || ('$metadata' in error && (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 404)
  );
}

function isChanged(error: unknown) {
  return error instanceof Error && (
    error.name === 'PreconditionFailed'
    || ('statusCode' in error && error.statusCode === 412)
    || ('$metadata' in error && (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 412)
  );
}

async function writeRecord(res: Response, record: unknown, signal: AbortSignal) {
  if (signal.aborted) throw new Error('Export cancelled');
  if (res.write(`${JSON.stringify(record)}\n`)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      res.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onDrain = () => { cleanup(); resolve(); };
    const onClose = () => { cleanup(); reject(new Error('Export connection closed')); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onAbort = () => { cleanup(); reject(new Error('Export cancelled')); };
    res.once('drain', onDrain);
    res.once('close', onClose);
    res.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else if (res.destroyed) onClose();
  });
}

async function finishResponse(res: Response, signal: AbortSignal) {
  if (signal.aborted) throw new Error('Export cancelled');
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      res.off('finish', onFinish);
      res.off('close', onClose);
      res.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onFinish = () => { cleanup(); resolve(); };
    const onClose = () => {
      cleanup();
      if (res.writableFinished) resolve();
      else reject(new Error('Export connection closed before completion'));
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onAbort = () => { cleanup(); reject(new Error('Export cancelled')); };
    res.once('finish', onFinish);
    res.once('close', onClose);
    res.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    try { res.end(); } catch (error) { cleanup(); reject(error); }
  });
}

async function noteBatch(workspaceId: string, startedAt: Date, cursor: string) {
  return db.select({
    id: noteMetadata.id,
    projectId: noteMetadata.projectId,
    userId: noteMetadata.userId,
    title: noteMetadata.title,
    bucketPath: noteMetadata.bucketPath,
    bodyKey: noteMetadata.bodyKey,
    version: noteMetadata.version,
    createdAt: noteMetadata.createdAt,
    updatedAt: noteMetadata.updatedAt,
    projectName: projects.name,
    authorName: authUsers.name,
    authorEmail: authUsers.email,
  }).from(noteMetadata)
    .innerJoin(projects, eq(projects.id, noteMetadata.projectId))
    .leftJoin(authUsers, eq(authUsers.id, noteMetadata.userId))
    .where(and(eq(projects.workspaceId, workspaceId), lte(noteMetadata.createdAt, startedAt), gt(noteMetadata.id, cursor)))
    .orderBy(asc(noteMetadata.id)).limit(BATCH_SIZE);
}

async function referencedNote(workspaceId: string, noteId: string) {
  const [row] = await db.select({ bucketPath: noteMetadata.bucketPath })
    .from(noteMetadata).innerJoin(projects, eq(projects.id, noteMetadata.projectId))
    .where(and(eq(projects.workspaceId, workspaceId), eq(noteMetadata.id, noteId))).limit(1);
  return row ?? null;
}

/** A readable JSONL audit export. Each attachment is completed by an attachment_end checksum record. */
export async function streamWorkspaceNoteExport(
  res: Response,
  workspaceId: string,
  actorUserId: string,
  signal: AbortSignal,
) {
  if (await getWorkspaceMemberRole(workspaceId, actorUserId) !== 'owner') return null;
  const startedAt = new Date();
  const eventId = randomUUID();
  const [workspace] = await db.select({ id: workspaces.id, key: workspaces.key, name: workspaces.name })
    .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return null;

  await db.insert(workspaceNoteExportEvents).values({
    id: eventId, workspaceId, actorUserId, status: 'started', startedAt,
  });

  let expectedNoteCount = 0;
  let noteCount = 0;
  let attachmentCount = 0;
  let diagnosticCount = 0;
  const diagnostic = async (entry: Diagnostic) => {
    diagnosticCount++;
    await writeRecord(res, { type: 'diagnostic', ...entry }, signal);
  };
  try {
    const [countRow] = await db.select({ count: sql<string>`count(*)` }).from(noteMetadata)
      .innerJoin(projects, eq(projects.id, noteMetadata.projectId))
      .where(and(eq(projects.workspaceId, workspaceId), lte(noteMetadata.createdAt, startedAt)));
    expectedNoteCount = Number(countRow?.count ?? 0);
    await writeRecord(res, {
      type: 'header', format: 'gravity_workspace_notes', version: 1,
      generatedAt: startedAt.toISOString(), generatedBy: actorUserId, workspace,
      privacyPolicy: 'Workspace owner only; includes private notes from every project and author.',
      consistency: 'Each note uses its captured metadata revision and body key. The export is not a workspace-wide database snapshot.',
      attachmentEncoding: 'base64 chunks; concatenate chunks by sequence, then verify attachment_end sha256 and byte count',
      expectedNoteCount,
    }, signal);

    let cursor = '';
    while (!signal.aborted) {
      const batch = await noteBatch(workspaceId, startedAt, cursor);
      if (!batch.length) break;
      for (const note of batch) {
        if (signal.aborted) throw new Error('Export cancelled');
        cursor = note.id;
        let body: string | null = null;
        try {
          // Revision keys are immutable. Legacy body.md is checked for in-flight changes.
          const before = note.bodyKey === 'body.md' ? await RustFS.statFile(note.bucketPath, note.bodyKey, signal) : null;
          body = await RustFS.readFileUtf8(note.bucketPath, note.bodyKey, signal);
          if (before) {
            const after = await RustFS.statFile(note.bucketPath, note.bodyKey, signal);
            if (before.etag !== after.etag) {
              body = null;
              await diagnostic({ noteId: note.id, object: 'body', reason: 'changed' });
            }
          }
        } catch (error) {
          if (signal.aborted) throw error;
          await diagnostic({ noteId: note.id, object: 'body', reason: isMissing(error) ? 'missing' : 'unavailable' });
        }

        await writeRecord(res, {
          type: 'note', id: note.id, projectId: note.projectId, projectName: note.projectName,
          author: { id: note.userId, name: note.authorName, email: note.authorEmail },
          title: note.title, version: note.version, createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(), bodyKey: note.bodyKey, body,
          bodySha256: body === null ? null : createHash('sha256').update(body).digest('hex'),
        }, signal);
        noteCount++;
        if (body === null) continue;

        let references: Map<string, Set<string>>;
        try {
          references = parseMediaReferences(body);
        } catch {
          await diagnostic({ noteId: note.id, object: 'reference', reason: 'invalid_reference' });
          continue;
        }
        for (const [targetNoteId, filenames] of references) {
          const target = targetNoteId === note.id ? note : await referencedNote(workspaceId, targetNoteId);
          if (!target) {
            await diagnostic({ noteId: note.id, object: 'reference', reason: 'outside_workspace' });
            continue;
          }
          for (const filename of filenames) {
            let stream: NodeJS.ReadableStream | null = null;
            try {
              const version = await RustFS.statFile(target.bucketPath, filename, signal);
              stream = await RustFS.streamFile(target.bucketPath, filename, version.etag, signal);
              const readable = stream as Readable;
              const onAbort = () => readable.destroy(new Error('Export cancelled'));
              signal.addEventListener('abort', onAbort, { once: true });
              const hash = createHash('sha256');
              let bytes = 0;
              let sequence = 0;
              try {
                if (signal.aborted) onAbort();
                for await (const raw of readable) {
                  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
                  for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
                    const chunk = buffer.subarray(offset, offset + CHUNK_BYTES);
                    hash.update(chunk);
                    bytes += chunk.length;
                    await writeRecord(res, {
                      type: 'attachment_chunk', sourceNoteId: note.id, noteId: targetNoteId,
                      filename, sequence: sequence++, base64: chunk.toString('base64'),
                    }, signal);
                  }
                }
              } finally {
                signal.removeEventListener('abort', onAbort);
              }
              await writeRecord(res, {
                type: 'attachment_end', sourceNoteId: note.id, noteId: targetNoteId,
                filename, chunks: sequence, bytes, sha256: hash.digest('hex'), etag: version.etag,
              }, signal);
              attachmentCount++;
            } catch (error) {
              if (signal.aborted) throw error;
              await diagnostic({ noteId: targetNoteId, filename, object: 'attachment', reason: isMissing(error) ? 'missing' : isChanged(error) ? 'changed' : 'unavailable' });
            } finally {
              (stream as { destroy?: () => void } | null)?.destroy?.();
            }
          }
        }
      }
      if (batch.length < BATCH_SIZE) break;
    }
    if (signal.aborted) throw new Error('Export cancelled');
    if (noteCount !== expectedNoteCount) {
      await diagnostic({ noteId: '', object: 'reference', reason: 'changed' });
    }
    const complete = diagnosticCount === 0;
    await writeRecord(res, { type: 'manifest', complete, expectedNoteCount, noteCount, attachmentCount, diagnosticCount }, signal);
    await finishResponse(res, signal);
    await db.update(workspaceNoteExportEvents).set({
      status: complete ? 'completed' : 'incomplete', finishedAt: new Date(), noteCount, attachmentCount, diagnosticCount,
    }).where(eq(workspaceNoteExportEvents.id, eventId));
  } catch (error) {
    await db.update(workspaceNoteExportEvents).set({
      status: signal.aborted ? 'cancelled' : 'failed', finishedAt: new Date(), noteCount, attachmentCount,
      diagnosticCount, error: error instanceof Error ? error.message.slice(0, 500) : 'Export failed',
    }).where(eq(workspaceNoteExportEvents.id, eventId));
    throw error;
  }
  return workspace;
}
