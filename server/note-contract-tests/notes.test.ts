import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/platform.js', () => ({ getProjectIdFromRequest: (req: any) => req.headers['x-project-id'] || req.query.projectId || req.body?.projectId || '' }));
vi.mock('../src/modules/workspaces/services/membership.js', () => ({ authorizeProjectAccess: vi.fn(async () => ({ allowed: true, userId: 'test-user' })) }));
vi.mock('../src/modules/auth/utils/request-auth.js', () => ({ resolveRequestActorUserId: vi.fn(async () => 'test-user') }));
vi.mock('../src/modules/notes/services/notes.js', () => ({ createNote: vi.fn(), updateNote: vi.fn(), getNote: vi.fn(), listNotes: vi.fn(), searchNotes: vi.fn(), deleteNote: vi.fn(), cleanupNoteMedia: vi.fn() }));
vi.mock('../src/modules/notes/repositories.js', () => ({ MetadataRepository: { getNoteMetadata: vi.fn() }, NotesRepository: { getAttachmentStream: vi.fn(), saveAttachmentStream: vi.fn() } }));
import * as notes from '../src/modules/notes/services/notes.js';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { authorizeProjectAccess } from '../src/modules/workspaces/services/membership.js';
import { createNotesRouter } from '../src/modules/notes/routes.js';
import { parseApiJson } from '../src/modules/notes/request-body.js';
import { noteErrorContext, noteErrorHandler } from '../src/modules/notes/errors.js';
import { NOTE_BODY_MAX_BYTES, NOTE_CONTENT_MAX_DEPTH, NOTE_CONTENT_MAX_NODES, validateNoteRequest } from '../src/modules/notes/contracts.js';

const app = express();
app.use('/api/v1/notes', noteErrorContext);
app.use(parseApiJson);
app.use('/api/v1', createNotesRouter());
app.use(noteErrorHandler);
const server = http.createServer(app);
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
const api = () => ({
  get: (path: string) => request(server).get('/api/v1' + path),
  head: (path: string) => request(server).head('/api/v1' + path),
  post: (path: string) => request(server).post('/api/v1' + path),
  patch: (path: string) => request(server).patch('/api/v1' + path),
  delete: (path: string) => request(server).delete('/api/v1' + path),
});
const assertError = (response: any, status = 400) => {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: expect.any(String), code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_INPUT', requestId: response.headers['x-request-id'] });
  expect(response.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
};
beforeEach(() => { vi.resetAllMocks(); vi.mocked(MetadataRepository.getNoteMetadata).mockResolvedValue({ projectId: 'project-test', bucketPath: 'synthetic' } as any); vi.mocked(authorizeProjectAccess).mockResolvedValue({ allowed: true, userId: 'test-user' }); });

describe('note runtime contracts (isolated, no database or storage)', () => {
  it.each(['limit=-1', 'limit=101', 'limit=Infinity', 'limit=9999999999999999999', 'limit=1.5', 'limit=0', 'limit=1&limit=2', 'offset=-1', 'offset=100001', 'sort=invalid'])('rejects paging %s', async query => {
    for (const path of ['/notes?', '/notes/search?q=hello&']) assertError(await api().get(path + query).set('x-project-id', 'project-test'));
    expect(notes.listNotes).not.toHaveBeenCalled(); expect(notes.searchNotes).not.toHaveBeenCalled();
  });
  it('validates trailing-slash route aliases', async () => {
    assertError(await api().post('/notes/').set('x-project-id', 'project-test').send({ title: 'Title', body: {} }));
    assertError(await api().get('/notes/search/').set('x-project-id', 'project-test'));
    expect(notes.createNote).not.toHaveBeenCalled(); expect(notes.searchNotes).not.toHaveBeenCalled();
  });
  it.each([undefined, '-1', 'Infinity', '5junk', '10485761'])('rejects invalid media length %s before storage access', length => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    validateNoteRequest({ originalUrl: '/notes/note-test/media', route: { path: '/notes/:noteId/media' }, method: 'POST', params: { noteId: 'note-test' }, query: { filename: 'photo.png' }, headers: { 'x-project-id': 'project-test', 'content-length': length } } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(400); expect(next).not.toHaveBeenCalled();
  });
  it('validates HEAD paging and bounds the original search string', async () => {
    expect((await api().head('/notes?limit=-1').set('x-project-id', 'project-test')).status).toBe(400);
    assertError(await api().get('/notes/search').query({ q: 'a' + ' '.repeat(1001) }).set('x-project-id', 'project-test'));
    expect(notes.listNotes).not.toHaveBeenCalled(); expect(notes.searchNotes).not.toHaveBeenCalled();
  });
  it.each([
    '/notes?limit[]=1', '/notes?offset[0]=2', '/notes/search?q=a&q=b',
    '/notes/search?q=%FF', '/notes/search?q=%ZZ', '/notes/search?q=%E0%A4',
    '/notes?projectId[]=project-test', '/notes/%ZZ', '/notes/%FF/media/a.png',
  ])('rejects arrays and malformed encodings: %s', async path => {
    assertError(await api().get(path).set('x-project-id', 'project-test'));
    expect(notes.listNotes).not.toHaveBeenCalled(); expect(notes.searchNotes).not.toHaveBeenCalled();
  });
  it('accepts case-insensitive aliases with encoded valid identifiers', async () => {
    vi.mocked(notes.createNote).mockResolvedValue({ id: 'note-test' } as any);
    expect((await api().post('/NOTES/').set('x-project-id', 'project-test').send({ title: 'Title', body: '' })).status).toBe(201);
    vi.mocked(notes.getNote).mockResolvedValue({ id: 'note-test' } as any);
    expect((await api().get('/NOTES/note%2Dtest/').set('x-project-id', 'project-test')).status).toBe(200);
    expect(notes.getNote).toHaveBeenCalledWith('note-test', 'project-test');
  });
  it('preserves valid rich-text, Markdown and exact byte/depth/node boundaries', async () => {
    const rich = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Café 😀', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
      { type: 'image', attrs: { src: '/api/v1/notes/note-test/media/photo.png', alt: 'Photo' } },
    ] }] });
    let atDepth: unknown = 1;
    for (let i = 0; i < NOTE_CONTENT_MAX_DEPTH; i++) atDepth = [atDepth];
    const atNodes = Array(NOTE_CONTENT_MAX_NODES - 1).fill(1);
    vi.mocked(notes.updateNote).mockResolvedValue({ id: 'note-test' } as any);
    for (const body of [rich, '# Legacy markdown', '', 'é'.repeat(NOTE_BODY_MAX_BYTES / 2), JSON.stringify(atDepth), JSON.stringify(atNodes)]) {
      expect((await api().patch('/notes/note-test/').set('x-project-id', 'project-test').send({ version: 1, body })).status).toBe(200);
      expect(notes.updateNote).toHaveBeenLastCalledWith('note-test', 'project-test', 1, { title: undefined, body });
    }
    for (const body of [JSON.stringify([atDepth]), JSON.stringify([...atNodes, 1])]) {
      assertError(await api().patch('/notes/note-test').set('x-project-id', 'project-test').send({ version: 1, body }));
    }
  });
  it('streams JSON-labeled attachments unchanged, including empty uploads', async () => {
    vi.mocked(NotesRepository.saveAttachmentStream).mockImplementation(async (_bucket, _filename, stream, length) => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const data = Buffer.concat(chunks);
      expect(data.length).toBe(length);
      expect(data.toString()).toBe(length ? '{raw attachment bytes}' : '');
    });
    for (const content of ['{raw attachment bytes}', '']) {
      expect((await api().post('/NOTES/note-test/MEDIA/?filename=data.txt').set('x-project-id', 'project-test').set('Content-Type', 'application/json').send(content)).status).toBe(201);
    }
    expect(NotesRepository.saveAttachmentStream).toHaveBeenCalledTimes(2);
  });
  it('rejects reserved mutation names and compressed media without storage access', async () => {
    assertError(await api().post('/notes/note-test/media?filename=body.md').set('x-project-id', 'project-test').send('body'));
    assertError(await api().delete('/notes/note-test/media/body.md').set('x-project-id', 'project-test'));
    assertError(await api().post('/notes/note-test/media?filename=a.txt').set('x-project-id', 'project-test').set('Content-Encoding', 'gzip').send('compressed'));
    expect(NotesRepository.saveAttachmentStream).not.toHaveBeenCalled();
  });
  it('rejects NUL text before database access, including escaped rich-text text', async () => {
    for (const patch of [{ title: 'bad\0title' }, { body: 'bad\0body' }, { body: JSON.stringify({ type: 'doc', content: [{ text: 'bad\0text' }] }) }]) {
      assertError(await api().patch('/notes/note-test').set('x-project-id', 'project-test').send({ version: 1, ...patch }));
    }
    assertError(await api().get('/notes/search?q=a%00').set('x-project-id', 'project-test'));
    assertError(await api().get('/notes/search?q=a?b%ZZ').set('x-project-id', 'project-test'));
    expect(notes.updateNote).not.toHaveBeenCalled();
  });
  it('uses fresh server IDs and logs only allowlisted diagnostics', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'synthetic_private_value';
    vi.mocked(notes.listNotes).mockRejectedValue(Object.assign(new Error(secret), {
      code: secret, stack: `Error: ${secret}\n    at /server/src/${secret}.ts:1:2\n    at /server/src/modules/notes/repositories.ts:10:20`,
    }));
    const first = await api().get('/notes').set('x-project-id', 'project-test').set('X-Request-ID', secret);
    const second = await api().get('/notes').set('x-project-id', 'project-test').set('X-Request-ID', secret);
    assertError(first, 500); assertError(second, 500);
    expect(first.body.requestId).not.toBe(second.body.requestId);
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(log).toHaveBeenLastCalledWith('Note API failure', expect.objectContaining({ code: 'UNKNOWN', frames: ['modules/notes/repositories.ts:10:20'], requestId: second.body.requestId }));
    log.mockRestore();
  });
  it('passes bounded paging and defaults', async () => {
    vi.mocked(notes.listNotes).mockResolvedValue([]);
    expect((await api().get('/notes').set('x-project-id', 'project-test')).status).toBe(200);
    expect(notes.listNotes).toHaveBeenCalledWith('project-test', 'test-user', 50, 0, 'desc');
    await api().get('/notes?limit=100&offset=100000&sort=asc').set('x-project-id', 'project-test');
    expect(notes.listNotes).toHaveBeenLastCalledWith('project-test', 'test-user', 100, 100000, 'asc');
  });
  it.each([null, {}, [], 42, true])('rejects non-string body %j before mutation', async body => {
    assertError(await api().post('/notes').set('x-project-id', 'project-test').send({ title: 'Title', body }));
    assertError(await api().patch('/notes/note-test').set('x-project-id', 'project-test').send({ version: 1, body }));
    expect(notes.createNote).not.toHaveBeenCalled(); expect(notes.updateNote).not.toHaveBeenCalled();
  });
  it.each([null, '1', 0, -1, 1.2, 2147483647, {}, true])('rejects revision %j', async version => {
    assertError(await api().patch('/notes/note-test').set('x-project-id', 'project-test').send({ version, body: 'changed' }));
    expect(notes.updateNote).not.toHaveBeenCalled();
  });
  it('rejects byte, depth and node limits', async () => {
    let nested: any = { type: 'text', text: 'secret' };
    for (let i = 0; i < 40; i++) nested = { type: 'doc', content: [nested] };
    for (const body of ['é'.repeat(NOTE_BODY_MAX_BYTES / 2 + 1), JSON.stringify(nested), JSON.stringify({ type: 'doc', content: Array(10001).fill({ text: 'a' }) })]) {
      assertError(await api().patch('/notes/note-test').set('x-project-id', 'project-test').send({ version: 1, body }));
    }
    expect(notes.updateNote).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized JSON using the same envelope', async () => {
    for (const payload of ['{"body":', JSON.stringify({ body: 'x'.repeat(1024 * 1024) })]) assertError(await api().post('/notes').set('Content-Type', 'application/json').send(payload));
  });
  it.each(['/notes/note-test/media?filename=a.png&filename=b.png', '/notes/note-test/media?filename=..', '/notes/note-test/media?filename=' + 'a'.repeat(260) + '.png', '/notes/note-test/cleanup?dryRun=yes'])('rejects media/cleanup input %s', async path => {
    assertError(await api().post(path).set('x-project-id', 'project-test').send('data'));
    expect(NotesRepository.saveAttachmentStream).not.toHaveBeenCalled(); expect(notes.cleanupNoteMedia).not.toHaveBeenCalled();
  });
  it('hides database, authorization and storage errors with correlated safe diagnostics', async () => {
    const secret = 'password=synthetic-private-value';
    const error = Object.assign(new Error(secret), { code: 'ECONNRESET' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(notes.listNotes).mockRejectedValueOnce(error);
    assertError(await api().get('/notes').set('x-project-id', 'project-test'), 500);
    vi.mocked(authorizeProjectAccess).mockRejectedValueOnce(error);
    assertError(await api().get('/notes').set('x-project-id', 'project-test'), 500);
    vi.mocked(MetadataRepository.getNoteMetadata).mockResolvedValue({ projectId: 'project-test', bucketPath: 'synthetic' } as any);
    vi.mocked(NotesRepository.getAttachmentStream).mockRejectedValueOnce(error);
    const failed = await api().get('/notes/note-test/media/a.png').set('x-project-id', 'project-test');
    assertError(failed, 500);
    expect(JSON.stringify(failed.body)).not.toContain(secret);
    expect(log).toHaveBeenLastCalledWith('Note API failure', expect.objectContaining({ requestId: failed.body.requestId, code: 'ECONNRESET' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    log.mockRestore();
  });
  it('terminates a failed media response after headers without appending exception text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let sent = false;
    vi.mocked(NotesRepository.getAttachmentStream).mockResolvedValue(new Readable({ read() {
      if (sent) return;
      sent = true;
      this.push(Buffer.from('partial file'));
      setImmediate(() => this.destroy(new Error('synthetic_storage_private_value')));
    } }));
    await expect(api().get('/notes/note-test/media/a.png').set('x-project-id', 'project-test')).rejects.toThrow();
    expect(log).toHaveBeenCalledWith('Note API failure', expect.objectContaining({ operation: '/notes/:noteId/media/:filename' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic_storage_private_value');
    log.mockRestore();
  });
  it('handles an asynchronous media stream failure safely', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(NotesRepository.getAttachmentStream).mockResolvedValue(new Readable({ read() { this.destroy(new Error('synthetic storage secret')); } }));
    assertError(await api().get('/notes/note-test/media/a.png').set('x-project-id', 'project-test'), 500);
    log.mockRestore();
  });
});
