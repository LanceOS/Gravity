import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Standalone MCP stdio server; stdout contains only newline-delimited JSON-RPC. */
export class McpStdioServer {
  async start(opts: { initDb?: boolean } = {}) {
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
        await stopEventBridge();
        // The standalone registry also opens the shared cache client and DB
        // pool. Release them on EOF as well as signals so the process can exit.
        const [{ client }, { pool }] = await Promise.all([
          import('../../lib/redis.js'), import('../../db/index.js'),
        ]);
        if (client?.isOpen) client.destroy();
        await pool.end();
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
  new McpStdioServer().start({ initDb: true }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
