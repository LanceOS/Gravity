import type { Request } from 'express';
import { env } from '../env.js';

function normalizeIp(ip?: string | null) {
  if (!ip) return null;
  const s = ip.trim();
  if (s.startsWith('::ffff:')) return s.split(':').pop() || s;
  return s;
}

export function getRequestSourceIp(req: Request): string | null {
  const remoteIp = normalizeIp(req.ip ?? null);
  const xffHeader = (req.header('x-forwarded-for') || req.header('X-Forwarded-For')) as string | undefined | null;
  const xRealIp = (req.header('x-real-ip') || req.header('X-Real-Ip')) as string | undefined | null;

  // If trusted proxies configured, only trust forwarding headers when the immediate remote IP is a trusted proxy.
  if (Array.isArray(env.trustedProxies) && env.trustedProxies.length > 0 && remoteIp) {
    const trusted = env.trustedProxies.map((p) => normalizeIp(p)!).filter(Boolean);
    if (trusted.includes(remoteIp)) {
      if (xffHeader) return normalizeIp(xffHeader.split(',')[0].trim());
      if (xRealIp) return normalizeIp(xRealIp);
    }
    // remote is not a trusted proxy -> ignore forwarding headers
    return remoteIp;
  }

  // No trusted proxies configured: prefer Express's `req.ip`, fall back to headers.
  if (remoteIp) return remoteIp;
  if (xffHeader) return normalizeIp(xffHeader.split(',')[0].trim());
  if (xRealIp) return normalizeIp(xRealIp);
  return null;
}

export default getRequestSourceIp;
