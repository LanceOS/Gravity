import { createClient, type RedisClientType } from 'redis';
import { env } from '../env.js';

let client: RedisClientType | null = null;
let isGracefulShutdown = false;

if (env.redisEnabled) {
  client = createClient({
    url: env.redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (isGracefulShutdown) {
          return false; // Stop reconnecting during shutdown
        }
        // Custom exponential backoff retry strategy with jitter (capped at 5s)
        const delay = Math.min(Math.pow(2, retries) * 100 + Math.random() * 100, 5000);
        console.warn(`Redis connection lost. Reconnecting in ${Math.round(delay)}ms (attempt ${retries})...`);
        return delay;
      },
      connectTimeout: 5000, // 5 seconds connection timeout
    },
  }) as RedisClientType;

  client.on('error', (err) => {
    // CRITICAL: catch error events to prevent Node from throwing uncaught exception and crashing
    console.error('Redis client error:', err);
  });

  client.on('connect', () => {
    console.log('Redis client is connecting...');
  });

  client.on('ready', () => {
    console.log('Redis client is ready and fully connected.');
  });

  client.on('end', () => {
    console.log('Redis connection has ended.');
  });

  // Start connecting asynchronously to avoid blocking server boot
  client.connect().catch((err) => {
    console.error('Failed to establish initial Redis connection:', err);
  });

  // Register graceful shutdown handlers
  const shutdown = async () => {
    if (isGracefulShutdown) return;
    isGracefulShutdown = true;
    console.log('Gracefully shutting down Redis client...');
    try {
      if (client && client.isOpen) {
        await client.quit();
        console.log('Redis client shut down cleanly.');
      }
    } catch (err) {
      console.error('Error during Redis client graceful shutdown:', err);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export function setClient(newClient: any) {
  client = newClient;
}

export { client };
