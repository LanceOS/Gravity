import type { Request } from 'express';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { env } from '../env.js';

function parseIp(value?: string | null) {
  // Reject ports, zone IDs, abbreviated IPv4 and other non-address input.
  if (!value || value.includes('%') || !isIP(value.trim())) return null;
  return ipaddr.process(value.trim());
}

/** Compile once at startup; invalid configuration must never silently widen trust. */
export function createRequestSourceIpResolver(trustedProxies: readonly string[]) {
  const ranges = trustedProxies.map((entry) => {
    const [address, prefix, ...extra] = entry.trim().split('/');
    const parsed = parseIp(address);
    if (!parsed || extra.length || (prefix !== undefined && !/^\d+$/.test(prefix))) {
      throw new Error(`Invalid TRUSTED_PROXIES address/CIDR: ${entry}`);
    }
    const bits = parsed.kind() === 'ipv4' ? 32 : 128;
    let length = prefix === undefined ? bits : Number(prefix);
    // Normalize IPv4-mapped IPv6 CIDRs alongside mapped socket addresses.
    if (isIP(address) === 6 && parsed.kind() === 'ipv4' && prefix !== undefined) length -= 96;
    if (length < 0 || length > bits) throw new Error(`Invalid TRUSTED_PROXIES prefix: ${entry}`);
    return [parsed, length] as const;
  });
  const isTrusted = (address: ipaddr.IPv4 | ipaddr.IPv6) => ranges.some(([range, bits]) =>
    (address instanceof ipaddr.IPv4 && range instanceof ipaddr.IPv4 && address.match(range, bits)) ||
    (address instanceof ipaddr.IPv6 && range instanceof ipaddr.IPv6 && address.match(range, bits)));

  return (req: Request): string | null => {
    // req.ip may already reflect a different Express trust policy. Only the socket
    // identifies the actual peer; never fall back to user-controlled headers.
    let current = parseIp(req.socket?.remoteAddress);
    if (!current) return null;
    if (!isTrusted(current)) return current.toString();
    const forwarded = req.header('x-forwarded-for');
    if (!forwarded) return current.toString();
    const chain = forwarded.split(',');
    for (let i = chain.length - 1; i >= 0 && isTrusted(current); i--) {
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
