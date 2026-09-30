import { describe, expect, it, vi } from 'vitest';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('authorized note media URLs', () => {
  it('returns a browser-renderable URL while enforcing session, membership and note scope', async () => {
    const owner = await createAuthenticatedApi({ email: 'media-owner@example.com' });
    const { project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    const other = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar }, workspace: { id: 'other-workspace', key: 'OTHER', workspaceKey: 'OTHER-WS' }, project: { id: 'other-project', key: 'OTHER', inviteCode: 'OTHER-INV' } });
    const note = await owner.post('/api/v1/notes').set('x-project-id', project.id)
      .send({ title: 'Media', body: 'Image follows' });
    expect(note.status).toBe(201);
    for (const filename of ['photo.png', 'screen-shot_2.JPG', 'animated.gif', 'image.webp']) {
      const upload = await owner.post(`/api/v1/notes/${note.body.id}/media?filename=${filename}`)
        .set('x-project-id', project.id).set('Content-Type', 'application/octet-stream').send(Buffer.from('image bytes'));
      expect(upload.status).toBe(201);
      const url = upload.body.url;
      expect(new URL(url, 'http://localhost').searchParams.get('projectId')).toBe(project.id);
      const image = await owner.get(url); // Deliberately no x-project-id header.
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toMatch(/^image\//);
      expect(image.headers['content-disposition']).toBe('inline');
      expect(image.headers['cache-control']).toBe('private, no-store');
      expect(image.body).toEqual(Buffer.from('image bytes'));
      const legacyUrl = url.split('?')[0];
      expect((await owner.get(legacyUrl)).body).toEqual(image.body);
      expect((await api().get(legacyUrl)).status).toBe(401);
      expect((await owner.get(legacyUrl).set('x-project-id', other.project.id)).status).toBe(404);
      expect((await api().get(url)).status).toBe(401);
      expect((await owner.get(url.replace(encodeURIComponent(project.id), encodeURIComponent(other.project.id)))).status).toBe(404);
    }
    const outsider = await createAuthenticatedApi({ email: 'media-outsider@example.com' });
    const url = `/api/v1/notes/${note.body.id}/media/photo.png?projectId=${encodeURIComponent(project.id)}`;
    const storageRead = vi.spyOn(NotesRepository, 'getAttachmentStream');
    expect((await outsider.get(url)).status).toBe(403);
    expect((await outsider.get(url.split('?')[0])).status).toBe(403);
    expect(storageRead).not.toHaveBeenCalled();
    expect((await owner.get('/api/v1/notes/missing-note/media/photo.png')).status).toBe(404);
    expect((await owner.get(`/api/v1/notes/${note.body.id}/media/missing.png`)).status).toBe(404);
    const metadataRead = vi.spyOn(MetadataRepository, 'getNoteMetadata');
    expect((await api().get('/api/v1/notes/missing-note/media/photo.png')).status).toBe(401);
    expect(metadataRead).not.toHaveBeenCalled();
    for (const filename of ['bad.svg', 'bad.html', 'photo space.png', '../photo.png']) {
      const upload = await owner.post(`/api/v1/notes/${note.body.id}/media?filename=${encodeURIComponent(filename)}`)
        .set('x-project-id', project.id).set('Content-Type', 'application/octet-stream').send(Buffer.from('bytes'));
      expect(upload.status).toBe(400);
    }
  });
});
