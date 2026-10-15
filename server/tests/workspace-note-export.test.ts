import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { Response as ExpressResponse } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { noteMetadata, workspaceMembers, workspaceNoteExportEvents } from '../src/db/schema.js';
import { RustFS } from '../src/lib/rustfs.js';
import { streamWorkspaceNoteExport } from '../src/modules/workspaces/services/note-export.js';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

type RecordLine = Record<string, any>;

class ExportResponseStub extends EventEmitter {
  writableFinished = false;
  ended = false;
  records: string[] = [];
  failManifest = false;
  write(chunk: string) {
    if (this.failManifest && chunk.includes('"type":"manifest"')) throw new Error('manifest write failed');
    this.records.push(chunk);
    return true;
  }
  end() { this.ended = true; }
  finish() { this.writableFinished = true; this.emit('finish'); }
}

async function exportLines(agent: Awaited<ReturnType<typeof createAuthenticatedApi>>, workspaceId: string) {
  const response = await agent.get(`/api/v1/workspaces/${workspaceId}/export/notes`)
    .buffer(true)
    .parse((stream, done) => {
      let text = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => { text += chunk; });
      stream.on('end', () => done(null, text));
      stream.on('error', done);
    });
  return { response, lines: typeof response.body === 'string' ? response.body.trim().split('\n').map(line => JSON.parse(line) as RecordLine) : [] };
}

describe('workspace note audit export', () => {
  it('stops before emitting a note if owner access is revoked during its body read', async () => {
    const owner = await createAuthenticatedApi({ email: 'export-revoked-owner@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    const created = await owner.post('/api/v1/notes').set('x-project-id', project.id).send({ title: 'Private audit', body: 'private body' });
    expect(created.status).toBe(201);
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const read = RustFS.readFileUtf8;
    vi.spyOn(RustFS, 'readFileUtf8').mockImplementationOnce(async (...args) => {
      entered();
      await releasePromise;
      return read(...args);
    });
    const response = new ExportResponseStub();
    const running = streamWorkspaceNoteExport(response as unknown as ExpressResponse, workspace.id, owner.user.id, new AbortController().signal);
    const rejected = expect(running).rejects.toThrow('access revoked');
    await enteredPromise;
    await db.update(workspaceMembers).set({ role: 'member' }).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, owner.user.id)));
    release();
    await rejected;
    expect(response.records.join('')).not.toContain('"type":"note"');
  });
  it('limits private note export to the workspace owner and includes complete content and binary attachments', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-owner@example.com', role: 'owner' });
    const memberApi = await createAuthenticatedApi({ email: 'note-export-member@example.com', role: 'member' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: memberApi.user.id, role: 'admin' });

    const noteId = 'note-private-export';
    const bucketPath = RustFS.getBucketPath(project.id, memberApi.user.id, noteId);
    const body = `# Private audit record\n\nComplete body beyond its excerpt.\n\n![scan](/api/v1/notes/${noteId}/media/scan.png)`;
    const attachment = Buffer.from([0, 255, 17, 42, 0, 128]);
    await RustFS.saveFile(bucketPath, '.revisions/rev1.md', body);
    await RustFS.saveFile(bucketPath, 'scan.png', attachment);
    await db.insert(noteMetadata).values({
      id: noteId, projectId: project.id, userId: memberApi.user.id, title: 'Private record',
      excerpt: 'Complete body', bucketPath, bodyKey: '.revisions/rev1.md', version: 3,
      createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-03T00:00:00Z'),
    });
    expect((await db.select({ visibility: noteMetadata.visibility }).from(noteMetadata).where(eq(noteMetadata.id, noteId)))[0]?.visibility).toBe('private');

    const denied = await memberApi.get(`/api/v1/workspaces/${workspace.id}/export/notes`);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toContain('Only workspace owners');

    const { response, lines } = await exportLines(ownerApi, workspace.id);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(lines[0]).toMatchObject({ type: 'header', privacyPolicy: expect.stringContaining('private notes') });
    expect(lines.find(line => line.type === 'note')).toMatchObject({
      id: noteId, body, version: 3, createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z', author: { id: memberApi.user.id },
      bodySha256: createHash('sha256').update(body).digest('hex'),
    });
    const chunks = lines.filter(line => line.type === 'attachment_chunk');
    expect(Buffer.concat(chunks.map(line => Buffer.from(line.base64, 'base64')))).toEqual(attachment);
    expect(lines.find(line => line.type === 'attachment_end')).toMatchObject({
      filename: 'scan.png', bytes: attachment.length,
      sha256: createHash('sha256').update(attachment).digest('hex'),
    });
    expect(lines.at(-1)).toMatchObject({ type: 'manifest', complete: true, noteCount: 1, attachmentCount: 1, diagnosticCount: 0 });
    const events = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorUserId: ownerApi.user.id, status: 'completed', noteCount: 1, attachmentCount: 1 });
  });

  it('never follows a media reference into another workspace', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-boundary@example.com', role: 'owner' });
    const first = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const second = await seedWorkspaceFixture({
      owner: { id: ownerApi.user.id, email: ownerApi.user.email },
      workspace: { id: 'other-workspace', key: 'OTH', workspaceKey: 'WS-OTH-123456' },
      project: { id: 'other-project', key: 'OTH', inviteCode: 'INV-OTH-0001ABCD' },
    });
    const sourceBucket = RustFS.getBucketPath(first.project.id, ownerApi.user.id, 'source');
    const targetBucket = RustFS.getBucketPath(second.project.id, ownerApi.user.id, 'target');
    await RustFS.saveFile(sourceBucket, '.revisions/body.md', '![secret](/api/v1/notes/note-target/media/secret.bin)');
    await RustFS.saveFile(targetBucket, 'secret.bin', Buffer.from('outside workspace'));
    await db.insert(noteMetadata).values([
      { id: 'note-source', projectId: first.project.id, userId: ownerApi.user.id,
        title: 'Source', bucketPath: sourceBucket, bodyKey: '.revisions/body.md' },
      { id: 'note-target', projectId: second.project.id, userId: ownerApi.user.id,
        title: 'Target', bucketPath: targetBucket, bodyKey: '.revisions/body.md' },
    ]);
    const { lines } = await exportLines(ownerApi, first.workspace.id);
    expect(lines.filter(line => line.type === 'note')).toHaveLength(1);
    expect(lines.some(line => line.type === 'attachment_chunk')).toBe(false);
    expect(lines).toContainEqual(expect.objectContaining({ type: 'diagnostic', object: 'reference', reason: 'outside_workspace' }));
    expect(lines.at(-1)).toMatchObject({ type: 'manifest', complete: false, attachmentCount: 0 });
  });

  it('reports missing bodies and referenced objects in the manifest and audit event', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-failure@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const firstBucket = RustFS.getBucketPath(project.id, ownerApi.user.id, 'one');
    const secondBucket = RustFS.getBucketPath(project.id, ownerApi.user.id, 'two');
    await RustFS.saveFile(firstBucket, '.revisions/one.md', '![lost](/api/v1/notes/note-one/media/lost.png)');
    await db.insert(noteMetadata).values([
      { id: 'note-one', projectId: project.id, userId: ownerApi.user.id, title: 'Missing media', bucketPath: firstBucket, bodyKey: '.revisions/one.md' },
      { id: 'note-two', projectId: project.id, userId: ownerApi.user.id, title: 'Missing body', bucketPath: secondBucket, bodyKey: '.revisions/two.md' },
    ]);

    const { lines } = await exportLines(ownerApi, workspace.id);
    expect(lines.filter(line => line.type === 'note')).toHaveLength(2);
    expect(lines.filter(line => line.type === 'diagnostic')).toEqual(expect.arrayContaining([
      expect.objectContaining({ noteId: 'note-one', object: 'attachment', filename: 'lost.png', reason: 'missing' }),
      expect.objectContaining({ noteId: 'note-two', object: 'body', reason: 'missing' }),
    ]));
    expect(lines.at(-1)).toMatchObject({ type: 'manifest', complete: false, expectedNoteCount: 2, noteCount: 2, diagnosticCount: 2 });
    const [event] = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
    expect(event).toMatchObject({ status: 'incomplete', noteCount: 2, diagnosticCount: 2 });
  });

  it('marks a storage stream failure as incomplete without claiming a valid attachment checksum', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-stream@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const noteId = 'note-stream-failure';
    const bucketPath = RustFS.getBucketPath(project.id, ownerApi.user.id, noteId);
    await RustFS.saveFile(bucketPath, '.revisions/body.md', `![file](/api/v1/notes/${noteId}/media/file.bin)`);
    await RustFS.saveFile(bucketPath, 'file.bin', Buffer.from('original bytes'));
    await db.insert(noteMetadata).values({ id: noteId, projectId: project.id, userId: ownerApi.user.id,
      title: 'Interrupted media', bucketPath, bodyKey: '.revisions/body.md' });
    const stream = vi.spyOn(RustFS, 'streamFile').mockResolvedValueOnce(Readable.from((async function* () {
      yield Buffer.from('partial');
      throw new Error('storage disconnected');
    })()));
    try {
      const { lines } = await exportLines(ownerApi, workspace.id);
      expect(lines.some(line => line.type === 'attachment_chunk')).toBe(true);
      expect(lines.some(line => line.type === 'attachment_end')).toBe(false);
      expect(lines).toContainEqual(expect.objectContaining({ type: 'diagnostic', object: 'attachment', reason: 'unavailable' }));
      expect(lines.at(-1)).toMatchObject({ type: 'manifest', complete: false, attachmentCount: 0, diagnosticCount: 1 });
    } finally {
      stream.mockRestore();
    }
  });

  it('labels an attachment changed between HEAD and GET as changed', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-changed@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const noteId = 'note-changed-media';
    const bucketPath = RustFS.getBucketPath(project.id, ownerApi.user.id, noteId);
    await RustFS.saveFile(bucketPath, '.revisions/body.md', `![file](/api/v1/notes/${noteId}/media/file.bin)`);
    await db.insert(noteMetadata).values({ id: noteId, projectId: project.id, userId: ownerApi.user.id,
      title: 'Changed media', bucketPath, bodyKey: '.revisions/body.md' });
    const changed = Object.assign(new Error('precondition failed'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
    const streamSpy = vi.spyOn(RustFS, 'streamFile').mockRejectedValueOnce(changed);
    try {
      const { lines } = await exportLines(ownerApi, workspace.id);
      expect(lines).toContainEqual(expect.objectContaining({ type: 'diagnostic', object: 'attachment', reason: 'changed' }));
      expect(lines.at(-1)).toMatchObject({ type: 'manifest', complete: false, attachmentCount: 0 });
    } finally {
      streamSpy.mockRestore();
    }
  });

  it('continues across metadata batches without dropping notes', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-batches@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const rows = [];
    for (let index = 0; index < 101; index++) {
      const id = `note-batch-${String(index).padStart(3, '0')}`;
      const bucketPath = RustFS.getBucketPath(project.id, ownerApi.user.id, id);
      await RustFS.saveFile(bucketPath, '.revisions/body.md', `Full body ${index}`);
      rows.push({ id, projectId: project.id, userId: ownerApi.user.id, title: id,
        bucketPath, bodyKey: '.revisions/body.md' });
    }
    await db.insert(noteMetadata).values(rows);
    const { lines } = await exportLines(ownerApi, workspace.id);
    expect(lines.filter(line => line.type === 'note')).toHaveLength(101);
    expect(lines.at(-1)).toMatchObject({ type: 'manifest', complete: true, expectedNoteCount: 101, noteCount: 101 });
  });

  it('stops a stalled attachment stream promptly when cancelled', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-cancel@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const noteId = 'note-cancel';
    const bucketPath = RustFS.getBucketPath(project.id, ownerApi.user.id, noteId);
    await RustFS.saveFile(bucketPath, '.revisions/body.md', `![file](/api/v1/notes/${noteId}/media/file.bin)`);
    await db.insert(noteMetadata).values({ id: noteId, projectId: project.id, userId: ownerApi.user.id,
      title: 'Stalled attachment', bucketPath, bodyKey: '.revisions/body.md' });
    const stalled = new PassThrough();
    const streamSpy = vi.spyOn(RustFS, 'streamFile').mockResolvedValueOnce(stalled);
    const controller = new AbortController();
    const response = new ExportResponseStub();
    try {
      const running = streamWorkspaceNoteExport(response as unknown as ExpressResponse, workspace.id, ownerApi.user.id, controller.signal);
      await vi.waitFor(() => expect(streamSpy).toHaveBeenCalledOnce());
      controller.abort();
      await expect(running).rejects.toThrow();
      expect(stalled.destroyed).toBe(true);
      const [event] = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
      expect(event.status).toBe('cancelled');
    } finally {
      streamSpy.mockRestore();
    }
  });

  it('records completion only after response finish and records a failed final manifest write', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'note-export-finish@example.com', role: 'owner' });
    const { workspace } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, email: ownerApi.user.email } });
    const response = new ExportResponseStub();
    const running = streamWorkspaceNoteExport(response as unknown as ExpressResponse, workspace.id, ownerApi.user.id, new AbortController().signal);
    await vi.waitFor(() => expect(response.ended).toBe(true));
    let [event] = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
    expect(event.status).toBe('started');
    response.finish();
    await running;
    [event] = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
    expect(event.status).toBe('completed');

    const failed = new ExportResponseStub();
    failed.failManifest = true;
    await expect(streamWorkspaceNoteExport(failed as unknown as ExpressResponse, workspace.id, ownerApi.user.id, new AbortController().signal))
      .rejects.toThrow('manifest write failed');
    const events = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
    expect(events.map(row => row.status)).toEqual(expect.arrayContaining(['completed', 'failed']));

    const closed = new ExportResponseStub();
    const closedRun = streamWorkspaceNoteExport(closed as unknown as ExpressResponse, workspace.id, ownerApi.user.id, new AbortController().signal);
    await vi.waitFor(() => expect(closed.ended).toBe(true));
    closed.emit('close');
    await expect(closedRun).rejects.toThrow('before completion');
    const finalEvents = await db.select().from(workspaceNoteExportEvents).where(eq(workspaceNoteExportEvents.workspaceId, workspace.id));
    expect(finalEvents.filter(row => row.status === 'failed')).toHaveLength(2);
  });
});
