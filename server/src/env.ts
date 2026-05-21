import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  FEDERATION_SYNC_INTERVAL_MS: z.coerce.number().int().nonnegative().default(5000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://gravity_user:secure_dev_password_change_me_in_prod@localhost:5432/gravity_workspace'),
  BETTER_AUTH_SECRET: z.string().min(1).default('change-me-before-production'),
  NODE_IDENTITY_MASTER_KEY: z.string().min(1).default('change-me-node-identity-master-key-before-production'),
  NODE_DISPLAY_NAME: z.string().optional(),
  BETTER_AUTH_BASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  TRUSTED_ORIGINS: z.string().optional(),
  OLLAMA_DEFAULT_ENDPOINT: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  ollamaDefaultEndpoint:
    parsed.OLLAMA_DEFAULT_ENDPOINT ??
    (parsed.NODE_ENV === 'test' ? 'http://localhost:11434' : 'http://host.docker.internal:11434'),
  nodeEnv: parsed.NODE_ENV,
};