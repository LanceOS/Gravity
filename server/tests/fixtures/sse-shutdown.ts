import { createServer } from 'node:http';
import type { Response } from 'express';
import { addClient, activeConnectionCount } from '../../src/realtime.js';
import { closeHttpServer } from '../../src/lib/http-shutdown.js';

// Exercise the production HTTP/SSE shutdown path with a real long-lived stream.
// Authentication is covered by the endpoint integration suite.
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
  addClient('shutdown-workspace', res as Response, {
    userId: 'shutdown-user', sourceIp: null, tokenId: null, authMethod: 'session',
  });
  res.write(': connected\n\n');
});
server.keepAliveTimeout = 60_000;
process.once('SIGTERM', () => {
  void closeHttpServer(server).then(async () => {
    if (activeConnectionCount() !== 0) throw new Error('SSE registry was not drained');
    const { pool } = await import('../../src/db/index.js');
    await pool.end();
    process.stdout.write('DRAINED\n');
    // No process.exit(): surviving timers or streams must fail the parent test.
  }).catch(error => { console.error(error); process.exitCode = 1; });
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') process.stdout.write(`PORT=${address.port}\n`);
});
