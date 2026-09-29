import { spawn } from 'node:child_process';
import { connect, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('exits naturally after SIGTERM with an open SSE connection', { timeout: 25_000 }, async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/sse-shutdown.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: 'pgmem://sse-shutdown', REDIS_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.resume();
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', reject);
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let response: Socket | undefined;
  try {
    const port = await new Promise<number>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('SSE fixture startup timed out')), 20_000);
      const onStartup = () => {
        const match = output.match(/PORT=(\d+)/);
        if (match) { clearTimeout(timeout); child.stdout.off('data', onStartup); resolve(Number(match[1])); }
      };
      child.stdout.on('data', onStartup);
      void exited.then(() => reject(new Error('SSE fixture exited before readiness')), reject);
    });
    response = connect(port, '127.0.0.1');
    const socket = response;
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n'));
      socket.once('data', () => resolve());
      socket.once('error', reject);
    });
    // Keep the connection open after the chunked response ends. A normal HTTP
    // agent can close it itself and conceal a server-side keep-alive leak.
    socket.on('data', () => {});
    const ended = new Promise<void>(resolve => socket.once('end', resolve));
    expect(child.kill('SIGTERM')).toBe(true);
    const result = await Promise.race([
      Promise.all([exited, ended]).then(([exit]) => exit),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('SSE shutdown stalled')), 3_000); }),
    ]);
    expect(result).toEqual({ code: 0, signal: null });
    expect(output).toContain('DRAINED');
  } finally {
    clearTimeout(timeout);
    response?.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  }
});
