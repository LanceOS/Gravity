import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a GitHub webhook payload against the `x-hub-signature-256` header.
 *
 * GitHub signs every delivery with HMAC-SHA256 over the raw request body using
 * the configured webhook secret. We must verify this before processing the
 * payload to ensure the request genuinely originated from GitHub.
 *
 * @param secret     - The GITHUB_WEBHOOK_SECRET configured on the repository.
 * @param rawBody    - The raw request body bytes, before JSON parsing.
 * @param signature  - The full value of the `x-hub-signature-256` header, e.g. `sha256=abc123...`.
 * @returns true if the signature is valid, false otherwise.
 */
export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    // timingSafeEqual prevents timing attacks that could leak the expected value
    // via response time differences.
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    // Lengths differ — definitely not equal.
    return false;
  }
}

/**
 * Validates that a URL is a well-formed HTTPS GitHub repository URL.
 * Requires the form https://github.com/<owner>/<repo>
 */
export function isValidGitHubRepoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== 'github.com') return false;
    const parts = url.pathname.split('/').filter(Boolean);
    // Must have at least owner + repo (2 segments)
    return parts.length >= 2;
  } catch {
    return false;
  }
}

/**
 * Validates that a URL is a safe HTTPS GitHub URL (for PR links etc.).
 * Less strict than isValidGitHubRepoUrl — only requires https://github.com/ prefix.
 */
export function isValidGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
}

/**
 * Sanitizes a GitHub username to only contain valid characters.
 * GitHub usernames are alphanumeric + hyphens, max 39 chars.
 */
export function sanitizeGitHubLogin(login: unknown): string {
  const raw = String(login ?? 'developer');
  return raw.replace(/[^a-zA-Z0-9\-]/g, '').slice(0, 39) || 'developer';
}
