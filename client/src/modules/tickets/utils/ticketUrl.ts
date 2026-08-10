export const DEFAULT_TICKET_URL_BASE = 'https://tickets.placeholder.local';

const RELATIVE_TICKET_URL_ORIGIN = 'https://ticket-link.invalid';
const DEFAULT_ALLOWED_TICKET_HOSTS = [new URL(DEFAULT_TICKET_URL_BASE).hostname];

/**
 * Parse the trusted external ticket hosts supplied by deployment configuration.
 * A wildcard for every host is deliberately ignored: it would turn a typo or
 * compromised URL-base setting into an unrestricted external redirect.
 */
export function parseAllowedTicketHosts(raw?: string): string[] {
  if (!raw) return [...DEFAULT_ALLOWED_TICKET_HOSTS];

  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && entry !== '*');
}

/**
 * Determine whether a parsed URL matches a trusted host entry.
 *
 * Supported entry formats:
 *  - exact hostname: example.com (default HTTPS port only)
 *  - wildcard subdomain: *.example.com (default HTTPS port only)
 *  - host with port: example.com:8443
 */
function isHostAllowed(url: URL, allowedHosts: readonly string[]): boolean {
  const hostname = url.hostname.toLowerCase();
  const hostWithPort = url.host.toLowerCase();

  return allowedHosts.some((rawEntry) => {
    const entry = rawEntry.trim().toLowerCase();
    if (!entry) return false;

    if (entry.includes(':')) {
      return hostWithPort === entry;
    }

    // An unqualified host entry must not implicitly allow arbitrary HTTPS
    // ports. Standard port 443 is normalized to an empty URL.port.
    if (url.port) return false;

    if (entry.startsWith('*.')) {
      const root = entry.slice(2);
      return Boolean(root) && hostname !== root && hostname.endsWith(`.${root}`);
    }

    return hostname === entry;
  });
}

function sanitizeRelativeTicketUrlBase(raw: string): string | null {
  try {
    const url = new URL(raw, RELATIVE_TICKET_URL_ORIGIN);

    // Protocol-relative URLs (//host) and browser-normalized backslash forms
    // (/\\host) resolve to another origin and must never be treated as paths.
    if (url.origin !== RELATIVE_TICKET_URL_ORIGIN) return null;

    // The base is a path prefix, not a full navigation URL. Drop query and
    // fragment data so a configured value cannot alter the generated ticket
    // URL after the key is appended.
    return url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Accept only a same-origin path or an HTTPS URL on an explicitly trusted
 * host. Invalid configuration falls back to the inert placeholder host.
 */
export function sanitizeTicketUrlBase(
  raw?: string,
  allowedHosts: readonly string[] = DEFAULT_ALLOWED_TICKET_HOSTS,
): string {
  const candidate = raw?.trim();
  if (!candidate) return DEFAULT_TICKET_URL_BASE;

  if (candidate.startsWith('/')) {
    return sanitizeRelativeTicketUrlBase(candidate) ?? DEFAULT_TICKET_URL_BASE;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return DEFAULT_TICKET_URL_BASE;
    if (url.username || url.password) return DEFAULT_TICKET_URL_BASE;
    if (!isHostAllowed(url, allowedHosts)) return DEFAULT_TICKET_URL_BASE;

    // Only retain the origin; configured paths, queries, fragments, and
    // credentials are not part of the trusted ticket URL base.
    return url.origin;
  } catch {
    return DEFAULT_TICKET_URL_BASE;
  }
}

function toWellFormedString(value: string): string {
  let normalized = '';

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
        normalized += value.slice(index, index + 2);
        index += 1;
      } else {
        normalized += '\uFFFD';
      }
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      normalized += '\uFFFD';
    } else {
      normalized += value.charAt(index);
    }
  }

  return normalized;
}

/** Build a ticket URL without allowing an unexpected ticket key to escape its path segment. */
export function buildTicketUrl(base: string, ticketKey: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(toWellFormedString(ticketKey))}`;
}
