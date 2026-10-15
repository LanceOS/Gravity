import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { noteMetadata, workspaceMembers, workspaceNoteExportEvents } from '../src/db/schema.js';
import { RustFS } from '../src/lib/rustfs.js';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

type RecordLine = Record<string, any>;

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
});
