import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseDeploymentConfig } from './config.js';

const rootEnvPath = join(process.cwd(), '..', '.env');
const serverEnvPath = join(process.cwd(), '.env');

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  return dotenv.parse(readFileSync(path));
}

// Merge env files explicitly so server/.env overrides root .env,
// while existing process.env values from the real environment still win.
const mergedEnv = {
  ...parseEnvFile(rootEnvPath),
  ...parseEnvFile(serverEnvPath),
};

for (const [key, value] of Object.entries(mergedEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const parsed = parseDeploymentConfig(process.env);

const splitList = (value?: string) =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const env = {
  port: parsed.PORT,
  federationSyncIntervalMs: parsed.FEDERATION_SYNC_INTERVAL_MS,
  federationSyncFailureBaseMs: parsed.FEDERATION_SYNC_FAILURE_BASE_MS,
  federationSyncFailureMaxMs: parsed.FEDERATION_SYNC_FAILURE_MAX_MS,
  federationSyncFailureMaxRetries: parsed.FEDERATION_SYNC_FAILURE_MAX_RETRIES,
  databaseUrl: parsed.DATABASE_URL,
  betterAuthSecret: parsed.BETTER_AUTH_SECRET,
  nodeIdentityMasterKey: parsed.NODE_IDENTITY_MASTER_KEY,
  nodeDisplayName: parsed.NODE_DISPLAY_NAME?.trim() || 'Gravity Node',
  betterAuthBaseUrl: parsed.BETTER_AUTH_BASE_URL ?? `http://localhost:${parsed.PORT}`,
  corsOrigins: splitList(parsed.CORS_ORIGINS),
  trustedOrigins: (() => {
    const configured = splitList(parsed.TRUSTED_ORIGINS);
    if (configured.length > 0) {
      return configured;
    }

    return [`http://localhost:${parsed.PORT}`];
  })(),
  trustedServiceTokens: splitList(parsed.TRUSTED_SERVICE_TOKENS),
  trustedServiceTokensFile: parsed.TRUSTED_SERVICE_TOKENS_FILE?.trim() || undefined,
  trustedServiceTokensRefreshIntervalMs: parsed.TRUSTED_SERVICE_TOKENS_REFRESH_INTERVAL_MS,
  aiDefaultProvider: parsed.AI_PROVIDER?.trim().toLowerCase(),
  aiDefaultModel: parsed.AI_MODEL?.trim() || undefined,
  aiStreamChunkSize: parsed.AI_STREAM_CHUNK_SIZE,
  mcpStdioWorkspaceId: parsed.MCP_STDIO_WORKSPACE_ID?.trim() || undefined,
  mcpStdioActorUserId: parsed.MCP_STDIO_ACTOR_USER_ID?.trim() || undefined,
  mcpEventNamespace: parsed.MCP_EVENT_NAMESPACE || undefined,
  nodeEnv: parsed.NODE_ENV,
  encryptedCredentialsMode: parsed.ENCRYPTED_CREDENTIALS_MODE!,
  allowEnvAiKeys: parsed.ALLOW_ENV_AI_KEYS,
  redisRequired: parsed.REDIS_REQUIRED === 'true',
  objectStorageRequired: parsed.OBJECT_STORAGE_REQUIRED === 'true',
  redisUrl: parsed.REDIS_URL,
  redisEnabled: parsed.REDIS_ENABLED,
  betterAuthOldSecrets: splitList(parsed.BETTER_AUTH_OLD_SECRETS),
  betterAuthOldSecretsMap: (() => {
    const raw = splitList(parsed.BETTER_AUTH_OLD_SECRETS);
    const map: Record<string, string> = {};
    for (const item of raw) {
      const m = item.match(/^([^=:\s]+)[=:](.+)$/);
      if (m) {
        map[m[1]] = m[2];
      }
    }
    return map;
  })(),
  trustedProxies: splitList(parsed.TRUSTED_PROXIES),
  csrfAllowHostFallback: parsed.CSRF_ALLOW_HOST_FALLBACK,
  rustfsEndpoint: parsed.RUSTFS_ENDPOINT,
  rustfsAccessKey: parsed.RUSTFS_ACCESS_KEY,
  rustfsSecretKey: parsed.RUSTFS_SECRET_KEY,
  rustfsBucket: parsed.RUSTFS_BUCKET,
  allowUnsignedLocalWebhooks: parsed.ALLOW_UNSIGNED_LOCAL_WEBHOOKS,
  githubWebhookSecret: parsed.GITHUB_WEBHOOK_SECRET?.trim() || undefined,
};
