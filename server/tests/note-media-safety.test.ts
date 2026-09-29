import { describe, expect, it, vi } from 'vitest';
import { cleanupMedia, DEFAULT_MEDIA_GRACE_MS, parseMediaReferences, type MediaCleanupDependencies } from '../src/modules/notes/services/media-cleanup.js';
import { createNoteCleanupService } from '../src/modules/notes/services/notes.js';

const owner = { id: 'owner', bucketPath: 'notes/owner', projectId: 'project' };
const other = { id: 'other', bucketPath: 'notes/other' };
function fixture() {
  return {
    listNotes: vi.fn(async () => [owner, other]),
    getBody: vi.fn(async (_bucket: string, _key?: string) => ''),
    listFiles: vi.fn(async () => ['body.md', '.revisions/old.json', 'photo.png']),
    statFile: vi.fn(async () => ({ lastModified: new Date(0), etag: 'version-1' })),
    deleteFile: vi.fn(async () => {}),
  } satisfies MediaCleanupDependencies;
}

describe('fail-safe media cleanup', () => {
  it.each(['ENOENT', 'EACCES'])('blocks all deletion for an unreadable cross-note body (%s)', async code => {
    const deps = fixture();
    deps.getBody.mockImplementation(async bucket => {
      if (bucket === other.bucketPath) throw Object.assign(new Error('body failed'), { code });
      return '';
    });
    await expect(cleanupMedia(deps, {}, owner)).rejects.toThrow('cannot read or parse body for note other');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('blocks missing owner body in the per-note service', async () => {
    const deps = fixture();
    deps.getBody.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const service = createNoteCleanupService({ ...deps, getMetadata: async () => owner as any });
    await expect(service.cleanupNoteMedia(owner.id, 'project')).rejects.toThrow('cannot read or parse body for note owner');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('preserves pending uploads throughout the default grace period', async () => {
    const deps = fixture();
    deps.statFile.mockResolvedValue({ lastModified: new Date(Date.now() - DEFAULT_MEDIA_GRACE_MS + 60_000), etag: 'new' });
    const result = await cleanupMedia(deps, {}, owner);
    expect(result.deferred.map(e => e.file)).toEqual(['photo.png']);
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it.each([
    '![shared](/api/v1/notes/owner/media/photo.png)',
    JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: '/api/v1/notes/owner/media/photo.png' } }] }),
  ])('preserves cross-note references in both body formats: %s', async body => {
    const deps = fixture();
    deps.getBody.mockImplementation(async bucket => bucket === other.bucketPath ? body : '');
    const service = createNoteCleanupService({ ...deps, getMetadata: async () => owner as any });
    expect((await service.cleanupNoteMedia(owner.id, 'project')).orphanedFiles).toEqual([]);
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('decodes JSON and URL escapes, Markdown escapes, and query fragments', () => {
    const name = 'a(b) café.png';
    expect(parseMediaReferences(JSON.stringify({ type: 'doc', content: [{ attrs: { src: `/api/v1/notes/owner/media/${encodeURIComponent(name)}?download=1#x` } }] })).get('owner')).toContain(name);
    expect(parseMediaReferences('[file](/api/v1/notes/owner/media/a\\(b\\).png)').get('owner')).toContain('a(b).png');
    expect(parseMediaReferences('{"type":"doc","content":[{"attrs":{"src":"\\/api\\/v1\\/notes\\/owner\\/media\\/photo.png"}}]}').get('owner')).toContain('photo.png');
  });

  it('parses reference-style Markdown and single-quoted HTML without phantom dead links', () => {
    expect([...parseMediaReferences('[image][ref]\n\n[ref]: /api/v1/notes/owner/media/a%28b%29.png').get('owner')!]).toEqual(['a(b).png']);
    expect([...parseMediaReferences("<img src='/api/v1/notes/owner/media/photo.png?x=1&amp;y=2'>").get('owner')!]).toEqual(['photo.png']);
  });

  it('retains escaped names through cleanup, rather than only recognizing them in isolation', async () => {
    const deps = fixture();
    deps.listFiles.mockResolvedValue(['body.md', 'a(b).png']);
    deps.getBody.mockResolvedValue('[file](/api/v1/notes/owner/media/a%28b%29.png)');
    const result = await cleanupMedia(deps, {}, owner);
    expect(result.orphanedFound).toEqual([]);
    expect(result.deadLinks).toEqual([]);
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('does not claim removal if the object changed after HEAD', async () => {
    const deps = fixture();
    deps.deleteFile.mockRejectedValue(Object.assign(new Error('Object changed'), { name: 'PreconditionFailed' }));
    await expect(cleanupMedia(deps, {}, owner)).rejects.toThrow('Object changed');
    expect(deps.deleteFile).toHaveBeenCalledTimes(1);
  });

  it.each([-1, NaN, Infinity])('rejects unsafe grace period %s', async gracePeriodMs => {
    const deps = fixture();
    await expect(cleanupMedia(deps, { gracePeriodMs })).rejects.toThrow('Invalid media cleanup grace period');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it.each(['![bad](/api/v1/notes/owner/media/%ZZ.png)', '/api/v1/notes/owner/media/', '{"type":"doc",'])('blocks malformed references/bodies: %s', async body => {
    const deps = fixture();
    deps.getBody.mockResolvedValue(body);
    await expect(cleanupMedia(deps)).rejects.toThrow('cannot read or parse body');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('dry run reports candidates without destructive calls or object reads', async () => {
    const deps = fixture();
    const result = await cleanupMedia(deps, { dryRun: true }, owner);
    expect(result.orphanedFound.map(e => e.file)).toEqual(['photo.png']);
    expect(result.deleted).toEqual([]);
    expect(deps.statFile).not.toHaveBeenCalled();
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('rechecks references, including newly created notes, before removal', async () => {
    const deps = fixture();
    deps.listNotes.mockResolvedValueOnce([owner]);
    deps.getBody.mockImplementation(async bucket => bucket === other.bucketPath ? '![new](/api/v1/notes/owner/media/photo.png)' : '');
    await cleanupMedia(deps, {}, owner);
    expect(deps.listNotes).toHaveBeenCalledTimes(2);
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('blocks deletion if a body becomes unavailable during recheck', async () => {
    const deps = fixture();
    deps.getBody.mockResolvedValueOnce('').mockResolvedValueOnce('').mockRejectedValue(new Error('read failed'));
    await expect(cleanupMedia(deps, {}, owner)).rejects.toThrow('cannot read or parse body');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('removes only old, still-unreferenced media with a version precondition', async () => {
    const deps = fixture();
    await cleanupMedia(deps, {}, owner);
    expect(deps.deleteFile).toHaveBeenCalledExactlyOnceWith('notes/owner', 'photo.png', 'version-1');
  });

  it('reads the committed body pointer and never removes internal body revisions', async () => {
    const deps = fixture();
    deps.listNotes.mockResolvedValue([{ ...owner, bodyKey: '.revisions/current.json' } as any]);
    await cleanupMedia(deps, { dryRun: true }, owner);
    expect(deps.getBody).toHaveBeenCalledWith(owner.bucketPath, '.revisions/current.json');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });
});
