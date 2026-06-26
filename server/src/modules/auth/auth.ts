import { betterAuth } from 'better-auth';

import { pool } from '../../db/index.js';
import { env } from '../../env.js';

export const auth = betterAuth({
  database: pool,
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthBaseUrl,
  trustedOrigins: env.trustedOrigins,
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
    },
  },
  plugins: [],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      tutorial_completed: {
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
    },
  },
});
