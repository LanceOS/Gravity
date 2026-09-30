import { createServer, request } from 'node:http';
import { PassThrough, Readable, type Transform } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/env.js', () => ({ env: {
  rustfsEndpoint: 'http://storage.invalid', rustfsAccessKey: 'synthetic',
  rustfsSecretKey: 'synthetic', rustfsBucket: 'synthetic',
} }));
import { RustFS } from '../src/lib/rustfs.js';

let send: ReturnType<typeof vi.spyOn>;
let body: Transform;
let signal: AbortSignal;
let attempts: Promise<number>;
let stored: Buffer;
const original = Buffer.from('existing contents');
const baseline = (source: Readable) => Object.fromEntries(
  ['error', 'end', 'close', 'finish', 'aborted', 'data'].map(event => [event, source.listenerCount(event)]),
);

beforeEach(() => {
  stored = original;
  send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(function (this: S3Client, command: any, options: any) {
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Key).toBe('notes/synthetic/file.txt');
    body = command.input.Body;
    signal = options.abortSignal;
    attempts = this.config.maxAttempts();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const onData = (chunk: Buffer) => chunks.push(chunk);
      const cleanup = () => {
        body.removeListener('data', onData);
        body.removeListener('end', onEnd);
        body.removeListener('error', onError);
      };
      const onEnd = () => { cleanup(); stored = Buffer.concat(chunks); resolve({}); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      body.on('data', onData).once('end', onEnd).once('error', onError);
    });
  });
});
afterEach(() => vi.restoreAllMocks());

async function checkFailure(source: PassThrough, trigger: () => void, message: string) {
  const listeners = baseline(source);
  const upload = RustFS.saveFileStream('notes/synthetic', 'file.txt', source, 12);
  const rejection = expect(upload).rejects.toThrow(message);
  await setImmediate();
  source.write('partial');
  trigger();
  await rejection;
  await setImmediate();
  expect(signal.aborted).toBe(true);
  expect(body.destroyed).toBe(true);
  expect(stored).toEqual(original);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await attempts).toBe(1);
  expect(baseline(source)).toEqual(listeners);
  // Transform retains its intrinsic prefinish listener.
  expect(body.eventNames()).toEqual(['prefinish']);
}

describe('request upload lifecycle', () => {
  it('forwards source errors and releases observers', async () => {
    const source = new PassThrough();
    await checkFailure(source, () => source.destroy(new Error('source failed')), 'source failed');
  });
  it('cancels on request aborted events even without a following close', async () => {
    const source = new PassThrough();
    await checkFailure(source, () => source.emit('aborted'), 'Upload source aborted');
    expect(source.isPaused()).toBe(true);
  });
  it('rejects premature close without an error event', async () => {
    const source = new PassThrough();
    await checkFailure(source, () => source.destroy(), 'Premature close');
  });
  it('enforces the size limit and keeps the request socket available for a 413', async () => {
    const source = new PassThrough();
    await checkFailure(source, () => source.write(Buffer.alloc(10 * 1024 * 1024)), 'LIMIT_EXCEEDED');
    expect(source.destroyed).toBe(false);
  });
  it.each(['downstream failed', 'NoSuchBucket'])('bounds downstream rejection and never replays a consumed source: %s', async message => {
    send.mockImplementation(function (this: S3Client, command: any, options: any) {
      body = command.input.Body;
      signal = options.abortSignal;
      attempts = this.config.maxAttempts();
      return new Promise((_, reject) => body.once('data', () => reject(Object.assign(new Error(message), { name: message }))));
    });
    const source = new PassThrough();
    await checkFailure(source, () => {}, message);
    expect(source.isPaused()).toBe(true);
  });
  it('settles on abort even if storage ignores the cancellation signal', async () => {
    send.mockImplementation((command: any, options: any) => {
      body = command.input.Body;
      signal = options.abortSignal;
      return new Promise(() => {});
    });
    const source = new PassThrough();
    const listeners = baseline(source);
    const upload = RustFS.saveFileStream('notes/synthetic', 'file.txt', source);
    const rejection = expect(upload).rejects.toThrow('Upload source aborted');
    await setImmediate();
    source.emit('aborted');
    await rejection;
    expect(signal.aborted).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(baseline(source)).toEqual(listeners);
  });
  it('forwards destination errors while the source remains open', async () => {
    const source = new PassThrough();
    await checkFailure(source, () => body.destroy(new Error('destination failed')), 'destination failed');
  });
  it('observes a late SDK rejection after local cancellation', async () => {
    let rejectStorage!: (error: Error) => void;
    send.mockImplementation(() => new Promise((_, reject) => { rejectStorage = reject; }));
    const source = new PassThrough();
    const upload = RustFS.saveFileStream('notes/synthetic', 'file.txt', source);
    const rejection = expect(upload).rejects.toThrow('Upload source aborted');
    await setImmediate();
    source.emit('aborted');
    await rejection;
    rejectStorage(new Error('late SDK rejection'));
    await setImmediate();
  });
  it('rejects an already aborted request without dispatching storage', async () => {
    const source = Object.assign(new PassThrough(), { aborted: true });
    await expect(RustFS.saveFileStream('notes/synthetic', 'file.txt', source)).rejects.toThrow('Upload source aborted');
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects an already destroyed source', async () => {
    const source = new PassThrough();
    source.destroy();
    await setImmediate();
    await expect(RustFS.saveFileStream('notes/synthetic', 'file.txt', source)).rejects.toThrow('Upload source is no longer readable');
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects an already consumed source without replacing the object with empty data', async () => {
    const source = Readable.from(['already consumed']);
    for await (const _chunk of source) { /* simulate a previous consumer */ }
    await expect(RustFS.saveFileStream('notes/synthetic', 'file.txt', source)).rejects.toThrow('Upload source is no longer readable');
    expect(send).not.toHaveBeenCalled();
    expect(stored).toEqual(original);
  });
  it('observes pending errors from an already destroyed source', async () => {
    const source = new PassThrough();
    source.destroy(new Error('pending source error'));
    await expect(RustFS.saveFileStream('notes/synthetic', 'file.txt', source)).rejects.toThrow('Upload source is no longer readable');
    await setImmediate();
    expect(send).not.toHaveBeenCalled();
    expect(source.listenerCount('error')).toBe(0);
  });
  it('settles a synchronous pipe failure without an unhandled rejection', async () => {
    const source = new PassThrough();
    vi.spyOn(source, 'pipe').mockImplementation(() => { throw new Error('pipe failed'); });
    await expect(RustFS.saveFileStream('notes/synthetic', 'file.txt', source)).rejects.toThrow('pipe failed');
    await setImmediate();
    expect(send).not.toHaveBeenCalled();
    expect(source.listenerCount('error')).toBe(0);
  });
  it('handles synchronous SDK exceptions without leaving the body or observers open', async () => {
    send.mockImplementation(function (this: S3Client, command: any, options: any) {
      body = command.input.Body;
      signal = options.abortSignal;
      attempts = this.config.maxAttempts();
      throw new Error('synchronous SDK failure');
    });
    const source = new PassThrough();
    const listeners = baseline(source);
    await expect(RustFS.saveFileStream('notes/synthetic', 'file.txt', source)).rejects.toThrow('synchronous SDK failure');
    expect(signal.aborted).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(baseline(source)).toEqual(listeners);
    expect(stored).toEqual(original);
  });
  it('does not mistake early SDK resolution for completion and still rejects a source abort', async () => {
    send.mockResolvedValue({});
    const source = new PassThrough();
    const upload = RustFS.saveFileStream('notes/synthetic', 'file.txt', source);
    const rejection = expect(upload).rejects.toThrow('Upload source aborted');
    await setImmediate();
    source.emit('aborted');
    await rejection;
  });
  it('rejects an abort in the same turn as the SDK acknowledgment', async () => {
    const source = new PassThrough();
    send.mockImplementation((command: any) => new Promise(resolve => {
      const destination = command.input.Body as Transform;
      destination.resume();
      destination.once('end', () => {
        resolve({});
        source.emit('aborted');
      });
    }));
    const upload = RustFS.saveFileStream('notes/synthetic', 'file.txt', source);
    const rejection = expect(upload).rejects.toThrow('Upload source aborted');
    source.end('complete body');
    await rejection;
    await setImmediate();
    expect(source.listenerCount('aborted')).toBe(0);
  });
  it('honors backpressure when the SDK has not begun consuming the body', async () => {
    let resolveStorage!: (result: object) => void;
    send.mockImplementation((command: any) => {
      body = command.input.Body;
      return new Promise(resolve => { resolveStorage = resolve; });
    });
    const source = new PassThrough();
    const upload = RustFS.saveFileStream('notes/synthetic', 'file.txt', source);
    await setImmediate();
    source.write(Buffer.alloc(128 * 1024));
    expect(source.isPaused()).toBe(true);
    source.end('tail');
    let length = 0;
    for await (const chunk of body) length += chunk.length;
    resolveStorage({});
    await upload;
    expect(length).toBe(128 * 1024 + 4);
  });
  it('preserves an HTTP 413 response after the real request exceeds the stream limit', async () => {
    const server = createServer(async (req, res) => {
      try {
        await RustFS.saveFileStream('notes/synthetic', 'file.txt', req);
        res.writeHead(201).end();
      } catch (error) {
        res.writeHead(error instanceof Error && error.message === 'LIMIT_EXCEEDED' ? 413 : 500).end('upload rejected');
      }
    });
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address() as { port: number };
      const response = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: address.port, method: 'POST', agent: false }, res => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end(Buffer.alloc(10 * 1024 * 1024 + 1));
      });
      expect(response).toEqual({ status: 413, body: 'upload rejected' });
      expect(signal.aborted).toBe(true);
      expect(stored).toEqual(original);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it('handles the real IncomingMessage aborted/error/close sequence without unhandled errors', async () => {
    let sawData!: () => void;
    const dataSeen = new Promise<void>(resolve => { sawData = resolve; });
    let reportUpload!: (error: unknown) => void;
    const uploadResult = new Promise<unknown>(resolve => { reportUpload = resolve; });
    const server = createServer(async (req, res) => {
      req.once('data', sawData);
      try {
        await RustFS.saveFileStream('notes/synthetic', 'file.txt', req);
        reportUpload(null);
      } catch (error) { reportUpload(error); }
      res.end();
    });
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address() as { port: number };
      const req = request({ host: '127.0.0.1', port: address.port, method: 'POST', agent: false });
      req.on('error', () => {}); // Expected client-side socket hangup.
      req.write('partial');
      await dataSeen;
      req.destroy();
      expect(await uploadResult).toMatchObject({ message: 'Upload source aborted' });
      await setImmediate();
      expect(signal.aborted).toBe(true);
      expect(body.destroyed).toBe(true);
      expect(stored).toEqual(original);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it.each([0, 10 * 1024 * 1024])('commits a complete %i-byte body and releases observers', async size => {
    const content = Buffer.alloc(size, 'x');
    const source = Readable.from([content]);
    const listeners = baseline(source);
    await RustFS.saveFileStream('notes/synthetic', 'file.txt', source, size);
    expect(stored.equals(content)).toBe(true);
    expect(signal.aborted).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input.ContentLength).toBe(size);
    expect(baseline(source)).toEqual(listeners);
    expect(body.eventNames()).toEqual(['prefinish']);
  });
});
