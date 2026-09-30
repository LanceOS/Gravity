import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Standalone MCP stdio server; stdout contains only newline-delimited JSON-RPC. */
export class McpStdioServer {
  async start(opts: { initDb?: boolean; shutdownTimeoutMs?: number } = {}) {
    // Only the CLI (or an explicitly opted-in process owner) may force exit.
    if (opts.shutdownTimeoutMs !== undefined &&
        (!Number.isSafeInteger(opts.shutdownTimeoutMs) || opts.shutdownTimeoutMs <= 0 || opts.shutdownTimeoutMs > 2_147_483_647)) {
      throw new Error('shutdownTimeoutMs must be a positive supported timer duration');
    }
    // Install before loading application modules: imports can emit startup logs.
    console.log = console.error.bind(console);
    console.info = console.error.bind(console);
    const [{ env }, { getMcpStdioContext }, { McpStdioSession }, { bootstrapMcpRegistries }] = await Promise.all([
      import('../../env.js'),
      import('./stdio-config.js'),
      import('./stdio-session.js'),
      import('./bootstrap.js'),
    ]);
    const context = getMcpStdioContext(env);
    if (opts.initDb) {
      const { initializeDatabase } = await import('../../db/bootstrap.js');
      await initializeDatabase();
    }
    bootstrapMcpRegistries();
    const { startMcpEventBridge } = await import('../../lib/mcp-event-bridge.js');
    const stopEventBridge = startMcpEventBridge();
    const onSignal = () => { void session.stop(); };
    const session = new McpStdioSession(process.stdin, process.stdout, {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      allowHandshake: false,
      onStop: async () => {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        process.stdin.pause();
        const forceTimer = opts.shutdownTimeoutMs === undefined ? undefined : setTimeout(() => {
          console.error('MCP stdio cleanup deadline exceeded.');
          process.exit(1);
        }, opts.shutdownTimeoutMs);
        forceTimer?.unref();
        let exitCode = 0;
        try {
          await stopEventBridge();
          // Release the shared cache client and database pool before exiting.
          const [{ client }, { pool }] = await Promise.all([
            import('../../lib/redis.js'), import('../../db/index.js'),
          ]);
          if (client?.isOpen) client.destroy();
          await pool.end();
        } catch {
          console.error('MCP stdio resource cleanup failed.');
          exitCode = 1;
        } finally {
          clearTimeout(forceTimer);
          // A timed-out tool can retain unrelated handles after cleanup finishes.
          if (opts.shutdownTimeoutMs !== undefined) process.exit(exitCode);
        }
      },
    });
    session.start();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    console.error('Gravity MCP Stdio Server running...');
    return session;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  new McpStdioServer().start({ initDb: true, shutdownTimeoutMs: 30_000 }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
