// Model the shared Redis client's active connection and signal interception
// without requiring an external service for the process-lifecycle regression.
import type { RedisClientType } from 'redis';
import { setClient } from '../../src/lib/redis.js';
import { McpStdioServer } from '../../src/modules/mcp/stdio.js';

const connection = setInterval(() => {}, 60_000);
setClient({ isOpen: true, destroy: () => clearInterval(connection) } as unknown as RedisClientType);
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
await new McpStdioServer().start();
process.stderr.write('SHUTDOWN_FIXTURE_READY\n');
