import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, '').toLowerCase();
}

export function csrfProtect(
  allowedOrigins?: string[],
  options?: { enforceInTest?: boolean; allowedServiceTokens?: string[] },
) {
  const allowed = (allowedOrigins ?? env.trustedOrigins).map(normalizeOrigin);
  const enforceInTest = options?.enforceInTest === true;
  const allowedServiceTokens = (options?.allowedServiceTokens && options.allowedServiceTokens.length)
    ? options.allowedServiceTokens
    : (env.trustedServiceTokens ?? []);

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only protect unsafe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

      // In tests, skip CSRF checks by default to keep unit tests deterministic
      if (env.nodeEnv === 'test' && !enforceInTest) return next();

      // If client provided an Authorization header (bearer token), assume non-browser client
      const authHeader = req.get('authorization');
      if (authHeader && String(authHeader).trim().length > 0) return next();

      // Allow service-to-service tokens provided via `x-service-token` or `x-api-key`
      const serviceToken = req.get('x-service-token') || req.get('x-api-key');
      if (serviceToken && allowedServiceTokens.length > 0 && allowedServiceTokens.includes(String(serviceToken))) return next();

      // Prefer Origin header; fall back to Referer
      let origin = req.get('origin') as string | undefined;
      const referer = (req.get('referer') || req.get('referrer')) as string | undefined;
      if (!origin && referer) {
        try {
          origin = new URL(referer).origin;
        } catch (e) {
          origin = undefined;
        }
      }

      if (!origin) {
        res.status(403).json({ error: 'Missing Origin or Referer header.' });
        return;
      }

      const originNormalized = normalizeOrigin(origin);
      if (allowed.includes(originNormalized)) return next();

      // Allow same-host requests when Host header matches origin host (useful behind some proxies)
      const hostHeader = req.get('host');
      if (hostHeader) {
        try {
          const originHost = new URL(originNormalized).host;
          if (originHost === hostHeader) return next();
        } catch (e) {
          // ignore parse errors
        }
      }

      res.status(403).json({ error: 'Invalid Origin or Referer header.' });
    } catch (err) {
      res.status(500).json({ error: 'CSRF check failed.' });
    }
  };
}
