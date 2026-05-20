import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://gravity_user:secure_dev_password_change_me_in_prod@localhost:5432/gravity_workspace'),
  BETTER_AUTH_SECRET: z.string().min(1).default('change-me-before-production'),
  BETTER_AUTH_BASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  TRUSTED_ORIGINS: z.string().optional(),
  OLLAMA_DEFAULT_ENDPOINT: z.string().url().default('http://host.docker.internal:11434'),
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
  databaseUrl: parsed.DATABASE_URL,
  betterAuthSecret: parsed.BETTER_AUTH_SECRET,
  betterAuthBaseUrl: parsed.BETTER_AUTH_BASE_URL ?? `http://localhost:${parsed.PORT}`,
  corsOrigins: splitList(parsed.CORS_ORIGINS),
  trustedOrigins: (() => {
    const configured = splitList(parsed.TRUSTED_ORIGINS);
    if (configured.length > 0) {
      return configured;
    }

    return [`http://localhost:${parsed.PORT}`];
  })(),
  ollamaDefaultEndpoint: parsed.OLLAMA_DEFAULT_ENDPOINT,
  nodeEnv: parsed.NODE_ENV,
};