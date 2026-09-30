import type { Request } from 'express';
import { createTrustedProxyMatcher, parseIp } from './trusted-proxies.js';
import { env } from '../env.js';

export function createRequestSourceIpResolver(trustedProxies: readonly string[]) {
  const isTrusted = createTrustedProxyMatcher(trustedProxies);

  return (req: Request): string | null => {
    // req.ip may already reflect a different Express trust policy. Only the socket
    // identifies the actual peer; never fall back to user-controlled headers.
    let current = parseIp(req.socket?.remoteAddress);
    if (!current) return null;
    if (!isTrusted(current.toString())) return current.toString();
    const forwarded = req.header('x-forwarded-for');
    if (!forwarded) return current.toString();
    const chain = forwarded.split(',');
    for (let i = chain.length - 1; i >= 0 && isTrusted(current.toString()); i--) {
      const next = parseIp(chain[i]);
      // Malformed entries are a trust boundary, not something to skip over.
      if (!next) break;
      current = next;
    }
    return current.toString();
  };
}

export const getRequestSourceIp = createRequestSourceIpResolver(env.trustedProxies);
export default getRequestSourceIp;
