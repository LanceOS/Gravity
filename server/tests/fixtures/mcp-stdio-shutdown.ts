// Model the shared Redis client's active connection and signal interception
// without requiring an external service for the process-lifecycle regression.
import type { RedisClientType } from 'redis';
import { setClient } from '../../src/lib/redis.js';
import { McpStdioServer } from '../../src/modules/mcp/stdio.js';
import { pool } from '../../src/db/index.js';

const connection = setInterval(() => {}, 60_000);
setClient({ isOpen: true, destroy: () => clearInterval(connection) } as unknown as RedisClientType);
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
if (process.env.MCP_SHUTDOWN_FIXTURE_MODE === 'stalled-cleanup') {
  pool.end = async () => {
    setInterval(() => {}, 60_000); // model a dependency retaining an active handle
    await new Promise<void>(() => {});
  };
}
if (process.env.MCP_SHUTDOWN_FIXTURE_MODE === 'late-operation') {
  setInterval(() => {}, 60_000); // model a tool still running after transport stop
}
await new McpStdioServer().start({ shutdownTimeoutMs: 1_000 });
process.stderr.write('SHUTDOWN_FIXTURE_READY\n');
