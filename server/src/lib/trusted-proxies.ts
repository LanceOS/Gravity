import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export function parseIp(value?: string | null) {
  // Reject ports, zone IDs, abbreviated IPv4 and other non-address input.
  if (!value || value.includes('%') || !isIP(value.trim())) return null;
  return ipaddr.process(value.trim());
}

/** Compile once at startup; invalid configuration must never silently widen trust. */
export function createTrustedProxyMatcher(trustedProxies: readonly string[]) {
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
  return (value?: string | null) => {
    const address = parseIp(value);
    return address !== null && ranges.some(([range, bits]) =>
      (address instanceof ipaddr.IPv4 && range instanceof ipaddr.IPv4 && address.match(range, bits)) ||
      (address instanceof ipaddr.IPv6 && range instanceof ipaddr.IPv6 && address.match(range, bits)));
  };
}
