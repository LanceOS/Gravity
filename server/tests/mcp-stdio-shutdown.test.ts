import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('standalone MCP process shutdown', () => {
  it.each(['EOF', 'SIGTERM', 'SIGINT'] as const)('closes application resources after %s', { timeout: 25_000 }, async (reason) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/mcp-stdio-shutdown.ts', import.meta.url))], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env, DATABASE_URL: 'pgmem://stdio-shutdown', REDIS_ENABLED: 'false',
        MCP_STDIO_WORKSPACE_ID: 'shutdown-workspace', MCP_STDIO_ACTOR_USER_ID: 'shutdown-user',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
      child.once('error', reject);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        let stderr = '';
        const diagnostic = () => {
          let message = stderr.slice(-4_000);
          for (const [name, value] of Object.entries(process.env)) {
            if (/(SECRET|TOKEN|PASSWORD|KEY|URL)/.test(name) && value && value.length > 6) {
              message = message.replaceAll(value, '[REDACTED]');
            }
          }
          return message;
        };
        // Allow startup/transpilation under a parallel full-suite/container
        // build load; the shutdown deadline below remains strictly bounded.
        timer = setTimeout(() => reject(new Error(`MCP shutdown fixture did not start.\n${diagnostic()}`)), 20_000);
        child.stderr.on('data', chunk => {
          stderr += String(chunk);
          if (stderr.includes('SHUTDOWN_FIXTURE_READY')) { clearTimeout(timer); resolve(); }
        });
        child.once('error', reject);
        void exit.then(({ code, signal }) => {
          clearTimeout(timer);
          reject(new Error(`MCP shutdown fixture exited before readiness (${code ?? signal}).\n${diagnostic()}`));
        }, reject);
      });
      if (reason === 'EOF') child.stdin.end();
      else child.kill(reason);
      const result = await Promise.race([
        exit,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`MCP process remained alive after ${reason}.`)), 2_000);
        }),
      ]);
      expect(result).toEqual({ code: 0, signal: null });
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      child.stdin.destroy();
      await exit;
    }
  });
});
