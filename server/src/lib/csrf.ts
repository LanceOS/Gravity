import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';
import { getTrustedServiceTokens } from './serviceTokens.js';

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, '').toLowerCase();
}

export function csrfProtect(
  allowedOrigins?: string[],
  options?: { enforceInTest?: boolean; allowedServiceTokens?: string[]; allowHostFallback?: boolean; trustedProxies?: string[] },
) {
  const allowed = (allowedOrigins ?? env.trustedOrigins).map(normalizeOrigin);
  const enforceInTest = options?.enforceInTest === true;
  const allowedServiceTokensOption = (options?.allowedServiceTokens && options.allowedServiceTokens.length)
    ? options.allowedServiceTokens
    : undefined;
  const allowHostFallback = typeof options?.allowHostFallback === 'boolean' ? options.allowHostFallback : env.csrfAllowHostFallback;
  const trustedProxiesList = Array.isArray(options?.trustedProxies) ? options.trustedProxies : env.trustedProxies;

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
      const allowedServiceTokens = allowedServiceTokensOption ?? getTrustedServiceTokens();
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

      // Helper: normalize immediate remote address for trusted-proxy checks
      const normalizeIp = (ip?: string | null) => {
        if (!ip) return null;
        const s = String(ip).trim();
        if (s.startsWith('::ffff:')) return s.split(':').pop() || s;
        return s;
      };

      // Build allowed host list from allowed origins
      const allowedHosts = allowed
        .map((o) => {
          try {
            return new URL(o).host.toLowerCase();
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean) as string[];

      // If Origin/Referer missing: allow fallback only when explicitly enabled and coming from a trusted proxy with a verified X-Forwarded-Host header
      if (!origin) {
        if (allowHostFallback) {
          const immediateRemote = normalizeIp((req as any).socket?.remoteAddress ?? (req as any).connection?.remoteAddress ?? null);
          const trusted = Array.isArray(trustedProxiesList) && trustedProxiesList.length > 0
            ? trustedProxiesList.map(normalizeIp).filter(Boolean).includes(immediateRemote || '')
            : false;

          if (trusted) {
            const xfh = (req.get('x-forwarded-host') || req.get('x-forwarded-host') as string | undefined) as string | undefined;
            if (xfh) {
              const fh = xfh.split(',')[0].trim().toLowerCase();
              if (allowedHosts.includes(fh)) return next();
            }
          }
        }

        res.status(403).json({ error: 'Missing Origin or Referer header.' });
        return;
      }

      const originNormalized = normalizeOrigin(origin);
      if (allowed.includes(originNormalized)) return next();

      // Origin present but not allowed. Permit a fallback only when configured and proxied via a trusted proxy that provides a verified X-Forwarded-Host (or as a last resort Host when the proxy is trusted).
      if (allowHostFallback) {
        const immediateRemote = normalizeIp((req as any).socket?.remoteAddress ?? (req as any).connection?.remoteAddress ?? null);
        const trusted = Array.isArray(trustedProxiesList) && trustedProxiesList.length > 0
          ? trustedProxiesList.map(normalizeIp).filter(Boolean).includes(immediateRemote || '')
          : false;

        if (trusted) {
          try {
            const originHost = new URL(originNormalized).host.toLowerCase();
            const xfh = (req.get('x-forwarded-host') || req.get('x-forwarded-host') as string | undefined) as string | undefined;
            if (xfh) {
              const fh = xfh.split(',')[0].trim().toLowerCase();
              if (fh === originHost) return next();
            }

            const hostHeader = req.get('host');
            if (hostHeader && hostHeader.toLowerCase() === originHost) return next();
          } catch (e) {
            // ignore parse errors
          }
        }
      }

      res.status(403).json({ error: 'Invalid Origin or Referer header.' });
    } catch (err) {
      res.status(500).json({ error: 'CSRF check failed.' });
    }
  };
}
