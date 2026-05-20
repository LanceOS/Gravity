import { betterAuth } from 'better-auth';
import { pool } from './db/index.js';
import { env } from './env.js';

export const auth = betterAuth({
  database: pool,
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthBaseUrl,
  trustedOrigins: env.trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
});