import { z } from 'zod';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { createTrustedProxyMatcher } from './lib/trusted-proxies.js';

const retiredCommandMessage = 'MCP_AGENT_COMMAND is no longer supported. Unset it and run the MCP stdio entrypoint separately; see docs/mcp/TRANSPORTS.md.';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
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
  AI_PROVIDER: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_STREAM_CHUNK_SIZE: z.coerce.number().int().positive().default(48),
  MCP_STDIO_WORKSPACE_ID: z.string().optional(),
  MCP_STDIO_ACTOR_USER_ID: z.string().optional(),
  // Validate the retired setting without exposing it to startup or a child process.
  MCP_AGENT_COMMAND: z.string().trim().max(0, { message: retiredCommandMessage }).optional(),
  MCP_EVENT_NAMESPACE: z.string().trim().max(128).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOW_ENV_AI_KEYS: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0' || s === '') return false;
    return v;
  }, z.boolean()).default(false),
  REDIS_REQUIRED: z.enum(['true', 'false']).default('false'),
  OBJECT_STORAGE_REQUIRED: z.enum(['true', 'false']).default('true'),
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
  LOCAL_TESTING_KEK: z.string().optional(),
  ALLOW_UNSIGNED_LOCAL_WEBHOOKS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
});


const list = (value?: string) => value?.split(',').map(v => v.trim()).filter(Boolean) ?? [];
const placeholder = (value: string) => /test[-_ ]|placeholder|change[-_ ]?me|replace[-_ ]|your[-_ ]|<|password|0123456789abcdef/i.test(value)
  || new Set(value).size < 8;

/** Pure validation: never opens a connection or includes supplied values in errors. */
export function parseDeploymentConfig(input: Record<string, unknown>) {
  const result = envSchema.safeParse(input);
  const errors: string[] = [];
  if (!result.success) {
    throw new Error('Invalid deployment configuration:\n' + result.error.issues.map(issue =>
      issue.path[0] === 'MCP_AGENT_COMMAND' ? `- ${retiredCommandMessage}` :
        `- ${issue.path.join('.')}: missing or invalid value`).join('\n') + '\nSee docs/deployment-configuration.md.');
  }
  const config = result.data;
  const production = config.NODE_ENV === 'production';
  const fail = (key: string, message: string) => errors.push(`- ${key}: ${message}`);
  const url = (key: string, value: string | undefined, protocols: string[], origin = false) => {
    try {
      const parsed = new URL(value ?? '');
      if (origin && !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value ?? '')) throw new Error();
      if (!protocols.includes(parsed.protocol) || !parsed.hostname || parsed.hash ||
        (origin && (parsed.username || parsed.password || parsed.search || parsed.pathname !== '/' || parsed.hostname.includes('*')))) throw new Error();
      const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
      const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
        (isIP(hostname) && ipaddr.process(hostname).range() === 'loopback');
      if (origin && production && (parsed.protocol !== 'https:' || loopback)) throw new Error();
      if (!origin && production && /<|>|change[-_]?me|your[-_]|password/i.test(decodeURIComponent(parsed.password))) throw new Error();
      return parsed;
    } catch { fail(key, origin ? 'must be an exact HTTP(S) origin (production requires a public HTTPS origin).' : `must be a valid ${protocols.join('/')} URL.`); }
  };
  for (const key of ['BETTER_AUTH_SECRET', 'NODE_IDENTITY_MASTER_KEY'] as const) {
    if (!config[key].trim() || (production && (Buffer.byteLength(config[key]) < 32 || placeholder(config[key])))) {
      fail(key, 'use an independent random secret of at least 32 bytes; generate with openssl rand -hex 32.');
    }
  }
  // Production intentionally uses UnconfiguredKmsProvider, not the local test key.
  const kek = config.LOCAL_TESTING_KEK ?? '';
  if (!production && !(/^[a-f\d]{64}$/i.test(kek) || Buffer.byteLength(kek) === 32)) {
    fail('LOCAL_TESTING_KEK', 'use a random 32-byte key encoded as 64 hex characters (or exactly 32 UTF-8 bytes).');
  }
  if (production || config.BETTER_AUTH_BASE_URL) {
    const base = url('BETTER_AUTH_BASE_URL', config.BETTER_AUTH_BASE_URL, ['http:', 'https:'], true);
    if (base) config.BETTER_AUTH_BASE_URL = base.origin;
  }
  for (const key of ['CORS_ORIGINS', 'TRUSTED_ORIGINS'] as const) {
    const origins = list(config[key]);
    if (production && !origins.length) fail(key, 'configure at least one explicit public HTTPS origin.');
    config[key] = origins.map(value => url(key, value, ['http:', 'https:'], true)?.origin ?? value).join(',');
  }
  url('DATABASE_URL', config.DATABASE_URL, config.NODE_ENV === 'test' ? ['postgres:', 'postgresql:', 'pgmem:'] : ['postgres:', 'postgresql:']);
  if (config.REDIS_REQUIRED === 'true' && !config.REDIS_ENABLED) fail('REDIS_REQUIRED', 'requires REDIS_ENABLED=true.');
  if (config.REDIS_ENABLED) url('REDIS_URL', config.REDIS_URL, ['redis:', 'rediss:']);
  url('RUSTFS_ENDPOINT', config.RUSTFS_ENDPOINT, ['http:', 'https:']);
  for (const key of ['RUSTFS_ACCESS_KEY', 'RUSTFS_SECRET_KEY', 'RUSTFS_BUCKET'] as const) {
    if (!config[key].trim()) fail(key, 'must not be empty.');
  }
  if (production && placeholder(config.RUSTFS_SECRET_KEY)) fail('RUSTFS_SECRET_KEY', 'replace default/placeholder storage credentials.');
  const webhookSecret = config.GITHUB_WEBHOOK_SECRET?.trim();
  if (production && (!webhookSecret || Buffer.byteLength(webhookSecret) < 32 || placeholder(webhookSecret))) {
    fail('GITHUB_WEBHOOK_SECRET', 'configure a random secret of at least 32 bytes matching GitHub webhook settings.');
  }
  if (config.ALLOW_UNSIGNED_LOCAL_WEBHOOKS && config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test') {
    fail('ALLOW_UNSIGNED_LOCAL_WEBHOOKS', 'only supported in development/test; production requires signed deliveries.');
  }
  try {
    createTrustedProxyMatcher(list(config.TRUSTED_PROXIES));
  } catch {
    // Runtime and preflight use the same parser, but diagnostics must not echo inputs.
    fail('TRUSTED_PROXIES', 'use exact IP addresses or valid CIDRs.');
  }
  if (errors.length) throw new Error(`Invalid deployment configuration:\n${errors.join('\n')}\nSee docs/deployment-configuration.md.`);
  return config;
}
