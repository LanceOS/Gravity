import { Pool } from 'pg';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../env.js';
import { REQUIRED_SCHEMA_VERSION } from '../db/schema-version.js';
import { client } from './redis.js';
import { createReadinessCheck } from './readiness.js';
import { isServerInitialized, isServerShuttingDown } from './server-lifecycle.js';

// A small, separately bounded pool keeps probes out of the application's query
// queue. Idle connections do not keep the process alive during shutdown.
const probePool = new Pool({ connectionString: env.databaseUrl, max: 2,
  connectionTimeoutMillis: 1500, query_timeout: 1500, statement_timeout: 1500,
  idleTimeoutMillis: 1000, allowExitOnIdle: true });
probePool.on('error', () => {}); // Errors are reported as unavailable, never as credentials/URLs.
const storage = new S3Client({ endpoint: env.rustfsEndpoint, region: 'us-east-1',
  credentials: { accessKeyId: env.rustfsAccessKey, secretAccessKey: env.rustfsSecretKey },
  forcePathStyle: true, maxAttempts: 1 });

export const checkDependencies = createReadinessCheck({
  postgres: { required: true, check: async () => { await probePool.query('SELECT 1'); return true; } },
  schema: { required: true, check: async () => {
    const result = await probePool.query('SELECT version, ready FROM gravity_schema_version WHERE id = 1');
    return result.rows[0]?.version === REQUIRED_SCHEMA_VERSION && result.rows[0]?.ready === true;
  } },
  objectStorage: { required: env.objectStorageRequired, check: async signal => {
    await storage.send(new HeadBucketCommand({ Bucket: env.rustfsBucket }), { abortSignal: signal });
    return true;
  } },
  redis: { required: env.redisRequired, check: async () => {
    if (!env.redisEnabled || !client?.isReady) return false;
    return await client.ping() === 'PONG';
  } },
});

export async function checkReadiness() {
  if (!isServerInitialized() || isServerShuttingDown()) {
    return { status: 'unavailable' as const, checks: {
      lifecycle: { required: true, status: 'unavailable' as const },
    } };
  }
  const result = await checkDependencies();
  // A signal can arrive while probes are awaiting I/O.
  if (isServerShuttingDown() || !isServerInitialized()) return {
    ...result, status: 'unavailable' as const,
    checks: { ...result.checks, lifecycle: { required: true, status: 'unavailable' as const } },
  };
  return result;
}

export async function initializeObjectStorage() {
  try {
    await storage.send(new HeadBucketCommand({ Bucket: env.rustfsBucket }), { abortSignal: AbortSignal.timeout(2000) });
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      try {
        await storage.send(new CreateBucketCommand({ Bucket: env.rustfsBucket }), { abortSignal: AbortSignal.timeout(2000) });
      } catch { console.warn('Object storage provisioning unavailable; readiness will report dependency state.'); }
    }
  }
}
