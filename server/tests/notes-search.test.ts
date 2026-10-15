import { describe, expect, it, vi } from 'vitest';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { backfillNoteSearchIndex } from '../src/modules/notes/services/search-backfill.js';
import { noteMetadata } from '../src/modules/notes/schema.js';
import { highlightedSnippet } from '../src/modules/notes/search-text.js';
import { db } from '../src/db/index.js';
import { eq } from 'drizzle-orm';

async function fixture() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const owner = await createAuthenticatedApi({ email: `search-${crypto.randomUUID()}@example.com` });
  const { project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar },
    workspace: { id: `workspace-${suffix}`, key: `W${suffix}`, workspaceKey: `WS-${suffix}` },
    project: { id: `project-${suffix}`, key: `P${suffix}`, inviteCode: `INV-${suffix}` },
  });
  const request = () => owner.get('/api/v1/notes/search').set('x-project-id', project.id);
  const create = async (title: string, body: string) => {
    const response = await owner.post('/api/v1/notes').set('x-project-id', project.id).send({ title, body });
    expect(response.status).toBe(201);
    return response.body;
  };
  return { owner, project, request, create };
}

describe('complete note search', () => {
  it('keeps a late highlighted match inside a bounded plain-text snippet', () => {
    const headline = `${'prefix '.repeat(30)}⟦latezephyr⟧ after`;
    const snippet = highlightedSnippet(headline, 'Title', 'prefix latezephyr');
    expect(snippet).toContain('latezephyr');
    expect(snippet).not.toContain('⟦');
    expect(snippet.length).toBeLessThanOrEqual(202);
    expect(highlightedSnippet('unrelated body', 'Latezephyr title', 'latezephyr')).toContain('Latezephyr');
  });
  it('finds late Markdown and rich-text terms while keeping previews and snippets bounded', async () => {
    const { request, create } = await fixture();
    const markdown = await create('Markdown', `${'prefix '.repeat(90)}**latezephyr** [linked words](https://example.com)`);
    const rich = await create('Rich text', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'prefix '.repeat(90) }, { type: 'text', text: 'laterocket ' },
      { type: 'text', text: 'split' }, { type: 'text', text: 'needle', marks: [{ type: 'strong' }] },
    ] }] }));
    expect(markdown.excerpt).not.toContain('latezephyr');
    expect(rich.excerpt).not.toContain('laterocket');
    for (const [term, id] of [['latezephyr', markdown.id], ['laterocket', rich.id], ['splitneedle', rich.id], ['linked', markdown.id]] as const) {
      const result = await request().query({ q: term, limit: 1 });
      expect(result.status).toBe(200);
      expect(result.body).toHaveLength(1);
      expect(result.body[0].id).toBe(id);
      expect(result.body[0].snippet).toContain(term);
      expect(result.body[0].snippet.length).toBeLessThanOrEqual(202);
      expect(result.body[0]).not.toHaveProperty('searchText');
    }
  });

  it('scopes results to the selected project and owner, and removes deleted notes', async () => {
    const first = await fixture();
    const second = await fixture();
    const note = await first.create('Private', 'uniquesecretterm');
    expect((await first.request().query({ q: 'uniquesecretterm' })).body.map((item: any) => item.id)).toContain(note.id);
    expect((await second.request().query({ q: 'uniquesecretterm' })).body).toEqual([]);
    expect(await MetadataRepository.searchNotesMetadata(first.project.id, second.owner.user.id, 'uniquesecretterm')).toEqual([]);
    expect((await second.owner.get('/api/v1/notes/search').set('x-project-id', first.project.id).query({ q: 'uniquesecretterm' })).status).toBe(403);
    expect((await first.owner.delete(`/api/v1/notes/${note.id}`).set('x-project-id', first.project.id)).status).toBe(200);
    expect((await first.request().query({ q: 'uniquesecretterm' })).body).toEqual([]);
  });

  it('backfills legacy bodies and never replaces a newer committed revision', async () => {
    const { owner, project, request } = await fixture();
    const id = `note-${crypto.randomUUID()}`;
    const bucketPath = `notes/${project.id}/${owner.user.id}/${crypto.randomUUID()}`;
    await NotesRepository.saveBody(bucketPath, `${'old '.repeat(150)}legacyneedle`);
    await MetadataRepository.createNoteMetadata({ id, projectId: project.id, userId: owner.user.id,
      title: 'Legacy', excerpt: 'old', bucketPath });
    expect((await request().query({ q: 'legacyneedle' })).body).toEqual([]);
    expect(await backfillNoteSearchIndex(1)).toBe(1);
    expect((await request().query({ q: 'legacyneedle' })).body[0].id).toBe(id);

    const updated = await owner.patch(`/api/v1/notes/${id}`).set('x-project-id', project.id)
      .send({ version: 1, body: 'freshneedle' });
    expect(updated.status).toBe(200);
    expect((await request().query({ q: 'legacyneedle' })).body).toEqual([]);
    expect((await request().query({ q: 'freshneedle' })).body[0].id).toBe(id);
    const titleOnly = await owner.patch(`/api/v1/notes/${id}`).set('x-project-id', project.id)
      .send({ version: 2, title: 'Renamed legacy note' });
    expect(titleOnly.status).toBe(200);
    expect((await request().query({ q: 'freshneedle' })).body[0].id).toBe(id);
    const [row] = await db.select().from(noteMetadata).where(eq(noteMetadata.id, id));
    expect(row.searchText).toBe('freshneedle');
  });

  it('indexes only the winning revision when concurrent updates race', async () => {
    const { owner, project, request, create } = await fixture();
    const note = await create('Race', 'initialneedle');
    const update = (body: string) => owner.patch(`/api/v1/notes/${note.id}`).set('x-project-id', project.id)
      .send({ version: 1, body });
    const results = await Promise.all([update('winneralpha'), update('winnerbeta')]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const winner = results.find(result => result.status === 200)!.body.body;
    const loser = winner === 'winneralpha' ? 'winnerbeta' : 'winneralpha';
    expect((await request().query({ q: winner })).body[0].id).toBe(note.id);
    expect((await request().query({ q: loser })).body).toEqual([]);
    expect((await request().query({ q: 'initialneedle' })).body).toEqual([]);
  });

  it('bounds pages and ranks title matches ahead of body matches', async () => {
    const { request, create } = await fixture();
    const bodyMatch = await create('Ordinary title', 'rankneedle in the body');
    const titleMatch = await create('Rankneedle title', 'unrelated body');
    const first = await request().query({ q: 'rankneedle', limit: 1, offset: 0 });
    const second = await request().query({ q: 'rankneedle', limit: 1, offset: 1 });
    expect(first.body.map((item: any) => item.id)).toEqual([titleMatch.id]);
    expect(second.body.map((item: any) => item.id)).toEqual([bodyMatch.id]);
  });

  it('resumes after a storage outage and does not publish a stale backfill read', async () => {
    const { owner, project, request } = await fixture();
    const id = `note-${crypto.randomUUID()}`;
    const bucketPath = `notes/${project.id}/${owner.user.id}/${crypto.randomUUID()}`;
    await NotesRepository.saveBody(bucketPath, 'staletoken');
    await MetadataRepository.createNoteMetadata({ id, projectId: project.id, userId: owner.user.id,
      title: 'Legacy race', bucketPath });

    vi.spyOn(NotesRepository, 'getBody').mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'ECONNRESET' }));
    await expect(backfillNoteSearchIndex(1)).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect((await db.select().from(noteMetadata).where(eq(noteMetadata.id, id)))[0].searchText).toBeNull();

    let release!: (body: string) => void;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const delayedRead = new Promise<string>(resolve => { release = resolve; });
    vi.spyOn(NotesRepository, 'getBody').mockImplementationOnce(() => { markStarted(); return delayedRead; });
    const backfill = backfillNoteSearchIndex(1);
    await started;
    const update = await owner.patch(`/api/v1/notes/${id}`).set('x-project-id', project.id)
      .send({ version: 1, body: 'currenttoken' });
    expect(update.status).toBe(200);
    release('staletoken');
    expect(await backfill).toBe(0);
    expect((await request().query({ q: 'staletoken' })).body).toEqual([]);
    expect((await request().query({ q: 'currenttoken' })).body[0].id).toBe(id);
  });
});
