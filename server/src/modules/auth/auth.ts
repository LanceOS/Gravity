import { betterAuth } from 'better-auth';
import { pool } from '../../db/index.js';
import { env } from '../../env.js';

export const auth = betterAuth({
  database: pool,
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthBaseUrl,
  trustedOrigins: env.trustedOrigins,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
  },
});