import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';

function parseAuthorizationUserId(value?: string | null) {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.trim().split(/\s+/, 2);
  if (!scheme || !token) {
    return null;
  }

  const normalizedScheme = scheme.toLowerCase();
  if (normalizedScheme === 'user' || normalizedScheme === 'bearer') {
    return token.trim() || null;
  }

  return null;
}

export async function resolveRequestActorUserId(req: Request) {
  // Only allow header-based testing/development shortcuts if explicitly enabled via environment variable.
  // Staging/QA deployments should never have this enabled.
  if (process.env.ALLOW_DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
    const headerUserId = req.header('x-user-id')?.trim() || parseAuthorizationUserId(req.header('authorization'));
    if (headerUserId) {
      return headerUserId;
    }
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}