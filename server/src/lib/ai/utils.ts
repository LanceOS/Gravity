import { env } from '../../env.js';

/**
 * @description Validates that a user-supplied URL is structurally correct and scheme-safe.
 * Under production environment, it prohibits requests to private subnets, loopbacks, and link-local networks (SSRF prevention).
 * @param {string} urlStr - The URL to validate.
 * @throws {Error} If URL is invalid, or targets a private/local range in production.
 */
export function validateOllamaUrl(urlStr: string): void {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL scheme must be http or https.');
  }

  const hostname = url.hostname.trim().toLowerCase();

  // If NODE_ENV is production, restrict access to private/local endpoints
  if (env.nodeEnv === 'production') {
    // Check for loopback, private, and link-local hostnames
    if (
      hostname === 'localhost' ||
      hostname === 'host.docker.internal' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error('Security Exception: Outbound requests to local/internal hostnames are prohibited in production.');
    }

    // Check for loopback IPv4/IPv6
    if (
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.')
    ) {
      throw new Error('Security Exception: Outbound requests to loopback addresses are prohibited in production.');
    }

    // Check for IPv4-mapped IPv6 addresses (::ffff:<ipv4>).
    // Node.js's URL parser strips brackets, so [::ffff:127.0.0.1] becomes '::ffff:127.0.0.1'.
    // We extract the embedded IPv4 portion and run it through the same RFC-1918 / loopback checks.
    if (hostname.startsWith('::ffff:')) {
      const embedded = hostname.slice('::ffff:'.length);
      if (
        embedded.startsWith('127.') ||
        embedded === '127.0.0.1' ||
        embedded === '0.0.0.0' ||
        embedded.startsWith('10.') ||
        embedded.startsWith('192.168.') ||
        embedded.startsWith('169.254.')
      ) {
        throw new Error('Security Exception: Outbound requests to private/loopback addresses via IPv4-mapped IPv6 are prohibited in production.');
      }
      // Cover 172.16.0.0/12
      if (embedded.startsWith('172.')) {
        const parts = embedded.split('.');
        const second = parseInt(parts[1], 10);
        if (second >= 16 && second <= 31) {
          throw new Error('Security Exception: Outbound requests to private networks via IPv4-mapped IPv6 are prohibited in production.');
        }
      }
    }

    // Check for link-local IPv4/IPv6
    if (hostname.startsWith('169.254.') || hostname.startsWith('fe80:')) {
      throw new Error('Security Exception: Outbound requests to link-local addresses are prohibited in production.');
    }

    // Check for private IPv4 blocks (RFC 1918)
    // 10.0.0.0/8
    if (hostname.startsWith('10.')) {
      throw new Error('Security Exception: Outbound requests to private networks are prohibited in production.');
    }
    // 172.16.0.0/12 (172.16.x.x to 172.31.x.x)
    if (hostname.startsWith('172.')) {
      const parts = hostname.split('.');
      const secondPart = parseInt(parts[1], 10);
      if (secondPart >= 16 && secondPart <= 31) {
        throw new Error('Security Exception: Outbound requests to private networks are prohibited in production.');
      }
    }
    // 192.168.0.0/16
    if (hostname.startsWith('192.168.')) {
      throw new Error('Security Exception: Outbound requests to private networks are prohibited in production.');
    }

    // Check for Unique Local Addresses (IPv6 fc00::/7)
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) {
      throw new Error('Security Exception: Outbound requests to private networks are prohibited in production.');
    }
  }
}


/**
 * Performs an HTTP fetch request with a specified timeout and exponential backoff retry.
 * @param {string} url - The URL to request.
 * @param {RequestInit} init - Standard fetch request parameters.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @param {number} maxRetries - Maximum number of retry attempts for network/timeout errors or transient codes (429, 5xx).
 * @return {Promise<Response>} The fetch response.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000,
  maxRetries = 0,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      
      const isTransient = response.status === 429 || [502, 503, 504].includes(response.status);
      if (isTransient && attempt <= maxRetries) {
        const delay = Math.min(10000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 200;
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      clearTimeout(timer);
      return response;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      const isNetwork = error instanceof Error && !isAbort;
      
      if ((isAbort || isNetwork) && attempt <= maxRetries) {
        const delay = Math.min(10000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 200;
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      clearTimeout(timer);
      throw error;
    }
  }
}

/**
 * Attempts to parse an error message from a failed fetch response.
 * @param {Response} response - The failed fetch response.
 * @param {string} fallback - The fallback message if parsing fails.
 * @return {Promise<string>} The parsed error message.
 */
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string | { message?: string } };
    if (typeof data.error === 'string') {
      return data.error;
    }
    if (typeof data.error?.message === 'string') {
      return data.error.message;
    }
  } catch {
    // Fall through.
  }

  try {
    const text = await response.text();
    return text || fallback;
  } catch {
    return fallback;
  }
}

