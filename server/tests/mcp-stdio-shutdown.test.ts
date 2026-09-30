import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('standalone MCP process shutdown', () => {
  it.each(['EOF', 'SIGTERM', 'SIGINT', 'stalled-cleanup', 'late-operation', 'CLI EOF'] as const)('closes application resources after %s', { timeout: 25_000 }, async (reason) => {
    const entrypoint = reason === 'CLI EOF' ? '../src/modules/mcp/stdio.ts' : './fixtures/mcp-stdio-shutdown.ts';
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL(entrypoint, import.meta.url))], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env, DATABASE_URL: 'pgmem://stdio-shutdown', REDIS_ENABLED: 'false',
        MCP_STDIO_WORKSPACE_ID: 'shutdown-workspace', MCP_STDIO_ACTOR_USER_ID: 'shutdown-user',
        MCP_SHUTDOWN_FIXTURE_MODE: reason,
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
          const ready = reason === 'CLI EOF' ? 'Gravity MCP Stdio Server running...' : 'SHUTDOWN_FIXTURE_READY';
          if (stderr.includes(ready)) { clearTimeout(timer); resolve(); }
        });
        child.once('error', reject);
        void exit.then(({ code, signal }) => {
          clearTimeout(timer);
          reject(new Error(`MCP shutdown fixture exited before readiness (${code ?? signal}).\n${diagnostic()}`));
        }, reject);
      });
      if (reason === 'SIGINT' || reason === 'SIGTERM') child.kill(reason);
      else child.stdin.end();
      const result = await Promise.race([
        exit,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`MCP process remained alive after ${reason}.`)), 2_000);
        }),
      ]);
      expect(result).toEqual({ code: reason === 'stalled-cleanup' ? 1 : 0, signal: null });
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      child.stdin.destroy();
      await exit;
    }
  });
});
