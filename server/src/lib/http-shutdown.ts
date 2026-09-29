import type { Server } from 'node:http';
import { beginServerShutdown } from './server-lifecycle.js';
import { closeSseConnections } from '../realtime.js';

export async function closeHttpServer(server: Server): Promise<void> {
  beginServerShutdown();
  const httpClosed = new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  // Attach rejection handling immediately while streams finish closing.
  await Promise.all([httpClosed, closeSseConnections()]);
}
