import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initializeDatabase } from './db/bootstrap.js';
import { env } from './env.js';
import { startMcpEventBridge } from './lib/mcp-event-bridge.js';
import { start as startServiceTokens, stopAutoRefresh } from './lib/serviceTokens.js';
import { beginServerInitialization, completeServerInitialization, beginServerShutdown } from './lib/server-lifecycle.js';
import { closeHttpServer } from './lib/http-shutdown.js';

async function main() {
  let stopMcpEventBridge: () => Promise<void> = async () => {};
  const app = createApp();
  const server = createServer(app);

  server.listen(env.port, () => {
    console.log(`gravity-server listening on ${env.port}`);
  });

  // Graceful shutdown helpers
  let isShuttingDown = false;
  const gracefulShutdown = async (reason: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    beginServerShutdown();
    console.log(`Shutdown initiated: ${reason}`);

    // Fail-safe: force exit after timeout
    const forceTimer = setTimeout(() => {
      console.error('Forcing shutdown due to timeout.');
      process.exit(1);
    }, 30_000);
    // Allow timer to not keep the event loop alive
    forceTimer.unref();

    try {
      await closeHttpServer(server);
      console.log('HTTP server closed.');
    } catch (err) {
      console.error('Error while closing HTTP server:', err);
    }

    stopAutoRefresh();
    await stopMcpEventBridge();

    try {
      const { pool } = await import('./db/index.js');
      if (pool && typeof (pool as any).end === 'function') {
        await (pool as any).end();
        console.log('Postgres pool ended.');
      }
    } catch (err) {
      console.error('Error ending Postgres pool:', err);
    }

    try {
      const { client } = await import('./lib/redis.js');
      if (client && client.isOpen) {
        await client.quit();
        console.log('Redis client shut down.');
      }
    } catch (err) {
      console.error('Error shutting down Redis client:', err);
    }

    clearTimeout(forceTimer);

    // Exit with non-zero for error-style reasons
    if (reason === 'uncaughtException' || reason === 'unhandledRejection') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception, initiating shutdown:', err);
    void gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection, initiating shutdown:', reason);
    void gracefulShutdown('unhandledRejection');
  });

  try {
    await initializeDatabase();
    beginServerInitialization();
    // Bucket creation follows the existing first-write provisioning policy.
    const { initializeObjectStorage } = await import('./lib/dependency-readiness.js');
    await initializeObjectStorage();
    await startServiceTokens();
    if (!isShuttingDown) {
      stopMcpEventBridge = startMcpEventBridge();
      completeServerInitialization();
    }
  } catch (error) {
    beginServerInitialization();
    console.error('Server initialization failed:', error);
    await gracefulShutdown('unhandledRejection');
    return;
  }

  // NOTE: Do not start the MCP stdio transport in the main HTTP server process.
  // MCP stdio requires exclusive use of stdout for JSON-RPC responses, but the
  // API server logs to stdout.
  // Run `server/src/modules/mcp/stdio.ts` as a separate process when stdio is needed.
  if (env.mcpAgentCommand || env.mcpStdioWorkspaceId || env.mcpStdioActorUserId) {
    console.warn(
      'Embedded MCP agent spawning is disabled in this process. Start server/src/modules/mcp/stdio.ts separately when needed.',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
