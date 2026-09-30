import type { Request, Response, NextFunction } from 'express';
import { createTrustedProxyMatcher } from './trusted-proxies.js';
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

  const isTrustedProxy = createTrustedProxyMatcher(trustedProxiesList);
  const allowedHosts = new Set(allowed.flatMap((origin) => {
    try {
      const url = new URL(origin);
      return ['http:', 'https:'].includes(url.protocol) ? [url.host.toLowerCase()] : [];
    } catch {
      return [];
    }
  }));

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
      const originHeader = req.get('origin');
      let origin = originHeader;
      const referer = req.get('referer') ?? req.get('referrer');
      if (originHeader === undefined && referer) {
        try {
          origin = new URL(referer).origin;
        } catch (e) {
          origin = undefined;
        }
      }

      // Only absent headers qualify: an invalid Referer must not become a
      // missing-origin request eligible for fallback.
      if (!origin) {
        if (originHeader === undefined && referer === undefined && allowHostFallback && isTrustedProxy(req.socket?.remoteAddress)) {
          // The trusted ingress must overwrite this with one validated host.
          // Reject lists rather than selecting an attacker-controlled entry.
          const forwardedHost = req.get('x-forwarded-host')?.trim().toLowerCase();
          if (forwardedHost && allowedHosts.has(forwardedHost)) return next();
        }

        res.status(403).json({ error: 'Missing Origin or Referer header.' });
        return;
      }

      const originNormalized = normalizeOrigin(origin);
      if (allowed.includes(originNormalized)) return next();

      // An explicit Origin/Referer is authoritative. Forwarded or client Host
      // data must never override the configured origin policy (including scheme
      // and port), even when the socket peer is trusted.
      res.status(403).json({ error: 'Invalid Origin or Referer header.' });
    } catch (err) {
      res.status(500).json({ error: 'CSRF check failed.' });
    }
  };
}
