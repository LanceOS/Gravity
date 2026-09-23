/**
 * DOM-independent rich-text sanitization policy shared by the browser and API
 * adapters. Keep this module free of Node- and browser-specific APIs so the
 * client can bundle the exact same allowlist that the server enforces.
 */
export interface HtmlSanitizationPolicy {
  /** Explicit tag allowlist. Anything not listed here is stripped. */
  readonly allowedTags: readonly string[];
  /** Explicit attribute allowlist. Anything not listed here is stripped. */
  readonly allowedAttributes: readonly string[];
  /** URI schemes permitted in href/src attributes. */
  readonly allowedUriSchemes: readonly string[];
}

export const HTML_SANITIZATION_POLICY = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a',
    'ul', 'ol', 'li',
    'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'img',
  ],
  allowedAttributes: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'start'],
  allowedUriSchemes: ['http', 'https', 'mailto'],
} as const satisfies HtmlSanitizationPolicy;

// Called out explicitly for auditability, even though the allowlists above
// already exclude these by construction.
export const EXPLICITLY_FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'] as const;
export const EXPLICITLY_FORBIDDEN_ATTRIBUTES = ['style', 'onclick', 'onerror', 'onload', 'onmouseover'] as const;

// Attributes that only make sense on a specific tag. Attributes not listed
// here (for example class and title) are allowed on any allowed tag.
export const ATTRIBUTE_TAG_SCOPE: Readonly<Partial<Record<string, readonly string[]>>> = {
  href: ['a'],
  target: ['a'],
  rel: ['a'],
  src: ['img'],
  alt: ['img'],
  start: ['ol'],
};

export function isAttributeAllowedForTag(tag: string, attrName: string): boolean {
  const scopedTags = Object.hasOwn(ATTRIBUTE_TAG_SCOPE, attrName) ? ATTRIBUTE_TAG_SCOPE[attrName] : undefined;
  return !scopedTags || scopedTags.includes(tag);
}

export function isSafeOrderedListStart(value: string): boolean {
  return /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

// Matches an allowed absolute URI or a scheme-less relative reference (path,
// fragment, query, or protocol-relative URL). This must stay aligned with the
// DOMPurify configuration used by both adapters.
export const ALLOWED_URI_REGEXP = new RegExp(
  `^(?:(?:${HTML_SANITIZATION_POLICY.allowedUriSchemes.join('|')}):|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.:-]|$))`,
  'i',
);

// Keep URI validation aligned with DOMPurify's ATTR_WHITESPACE expression.
// URL parsers ignore these characters around (and, for some characters, in)
// schemes, so a value such as \u0000javascript: must never be treated as safe.
// eslint-disable-next-line no-control-regex -- mirrors DOMPurify ATTR_WHITESPACE.
export const URI_CONTROL_OR_WHITESPACE_REGEXP = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g;
export const DANGEROUS_URI_SCHEME_REGEXP = /^(?:javascript|data|vbscript):/i;

export function normalizeUriForSchemeValidation(uri: string): string {
  return uri.replace(URI_CONTROL_OR_WHITESPACE_REGEXP, '');
}

export function isSafeSanitizationUri(uri: string): boolean {
  if (!uri) {
    return false;
  }

  const normalized = normalizeUriForSchemeValidation(uri);
  return !DANGEROUS_URI_SCHEME_REGEXP.test(normalized) && ALLOWED_URI_REGEXP.test(normalized);
}

export function isExternalUrl(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href.trim());
}

export const REQUIRED_SAFE_REL_TOKENS = ['noopener', 'noreferrer'] as const;

// Adds safe-navigation tokens without discarding any supplied rel values.
export function withSafeRelTokens(existingRel: string | null): string {
  const tokens = new Set((existingRel ?? '').split(/\s+/).filter(Boolean));
  REQUIRED_SAFE_REL_TOKENS.forEach((token) => tokens.add(token));
  return Array.from(tokens).join(' ');
}
