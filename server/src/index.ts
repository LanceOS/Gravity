import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initializeDatabase } from './db/bootstrap.js';
import { env } from './env.js';
import { startFederationSyncLoop, stopFederationSyncLoop } from './services/federation.js';
import { ensureLocalNodeIdentity } from './lib/node-identity.js';

async function main() {
  await initializeDatabase();
  await ensureLocalNodeIdentity();
  startFederationSyncLoop();

  const app = createApp();
  const server = createServer(app);

  server.on('close', () => {
    stopFederationSyncLoop();
  });

  server.listen(env.port, () => {
    console.log(`gravity-server listening on ${env.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});