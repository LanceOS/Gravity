import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

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

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  FEDERATION_SYNC_INTERVAL_MS: z.coerce.number().int().nonnegative().default(5000),
  FEDERATION_SYNC_FAILURE_BASE_MS: z.coerce.number().int().positive().default(5000),
  FEDERATION_SYNC_FAILURE_MAX_MS: z.coerce.number().int().positive().default(60000),
  FEDERATION_SYNC_FAILURE_MAX_RETRIES: z.coerce.number().int().positive().default(5),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  NODE_IDENTITY_MASTER_KEY: z.string().min(1),
  NODE_DISPLAY_NAME: z.string().optional(),
  BETTER_AUTH_BASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  TRUSTED_ORIGINS: z.string().optional(),
  TRUSTED_SERVICE_TOKENS: z.string().optional(),
  TRUSTED_SERVICE_TOKENS_FILE: z.string().optional(),
  TRUSTED_SERVICE_TOKENS_REFRESH_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60000),
  BETTER_AUTH_OLD_SECRETS: z.string().optional(),
  TRUSTED_PROXIES: z.string().optional(),
    CSRF_ALLOW_HOST_FALLBACK: z.preprocess((v) => {
      if (typeof v !== 'string') return v;
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0' || s === '') return false;
      return v;
    }, z.boolean()).default(false),
  OLLAMA_DEFAULT_ENDPOINT: z.string().url().optional(),
  MCP_STDIO_WORKSPACE_ID: z.string().optional(),
  MCP_STDIO_ACTOR_USER_ID: z.string().optional(),
  MCP_AGENT_COMMAND: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOW_ENV_AI_KEYS: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0' || s === '') return false;
    return v;
  }, z.boolean()).default(false),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ENABLED: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0' || s === '') return false;
    return v;
  }, z.boolean()).default(false),
  RUSTFS_ENDPOINT: z.string().default('http://localhost:9000'),
  RUSTFS_ACCESS_KEY: z.string().default('admin'),
  RUSTFS_SECRET_KEY: z.string().default('password'),
  RUSTFS_BUCKET: z.string().default('notes'),
});

const parsed = envSchema.parse(process.env);

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
  ollamaDefaultEndpoint:
    parsed.OLLAMA_DEFAULT_ENDPOINT ??
    (parsed.NODE_ENV === 'test' ? 'http://localhost:11434' : 'http://host.docker.internal:11434'),
  mcpStdioWorkspaceId: parsed.MCP_STDIO_WORKSPACE_ID?.trim() || undefined,
  mcpStdioActorUserId: parsed.MCP_STDIO_ACTOR_USER_ID?.trim() || undefined,
  mcpAgentCommand: parsed.MCP_AGENT_COMMAND?.trim() || undefined,
  nodeEnv: parsed.NODE_ENV,
  allowEnvAiKeys: parsed.ALLOW_ENV_AI_KEYS,
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
};