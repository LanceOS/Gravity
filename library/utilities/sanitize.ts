import DOMPurify from 'dompurify';

/**
 * Centralized HTML sanitization policy. This is the single source of truth
 * for what HTML survives sanitization anywhere in the app (rich text paste,
 * rendered rich text, markdown-derived links, AI output, etc). Do not call
 * DOMPurify directly outside this file - route all sanitization through
 * `sanitizeHtml` / `isSafeHref` so the policy stays in one auditable place.
 */
export interface SanitizeHtmlConfig {
  /** Explicit tag allowlist. Anything not listed here is stripped. */
  readonly allowedTags: readonly string[];
  /** Explicit attribute allowlist. Anything not listed here is stripped. */
  readonly allowedAttributes: readonly string[];
  /** URI schemes permitted in href/src attributes. Everything else - including javascript:, data:, and vbscript: - is stripped. */
  readonly allowedUriSchemes: readonly string[];
}

export const SANITIZE_CONFIG: SanitizeHtmlConfig = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a',
    'ul', 'ol', 'li',
    'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'img',
  ],
  allowedAttributes: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class'],
  allowedUriSchemes: ['http', 'https', 'mailto'],
};

// Called out explicitly for auditability, even though the allowlists above
// already exclude these by construction (anything not allowlisted is dropped).
const EXPLICITLY_FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'];
const EXPLICITLY_FORBIDDEN_ATTRIBUTES = ['style', 'onclick', 'onerror', 'onload', 'onmouseover'];

// Matches an absolute URI whose scheme is in SANITIZE_CONFIG.allowedUriSchemes,
// or a scheme-less relative reference (path, fragment, query, protocol-relative
// "//"). Anything else - including javascript:, data:, and vbscript: - fails
// to match and the attribute is stripped by DOMPurify.
const ALLOWED_URI_REGEXP = new RegExp(
  `^(?:(?:${SANITIZE_CONFIG.allowedUriSchemes.join('|')}):|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.:-]|$))`,
  'i',
);

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [...SANITIZE_CONFIG.allowedTags],
  ALLOWED_ATTR: [...SANITIZE_CONFIG.allowedAttributes],
  ALLOWED_URI_REGEXP,
  FORBID_TAGS: EXPLICITLY_FORBIDDEN_TAGS,
  FORBID_ATTR: EXPLICITLY_FORBIDDEN_ATTRIBUTES,
  ALLOW_DATA_ATTR: false,
};

function isExternalUrl(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href.trim());
}

const DANGEROUS_URI_SCHEME_REGEXP = /^\s*(?:javascript|data|vbscript):/i;

// DOMPurify allows data: URIs on img/audio/video `src` by default even when
// ALLOWED_URI_REGEXP would otherwise reject them. Explicitly reject the
// schemes we never want on href/src, regardless of tag, as defense-in-depth
// on top of ALLOWED_URI_REGEXP.
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if ((data.attrName === 'href' || data.attrName === 'src') && DANGEROUS_URI_SCHEME_REGEXP.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

// Force safe `rel` on any link that opens in a new tab, and treat any
// absolute-URL link as external and open it safely in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') {
    return;
  }

  const href = node.getAttribute('href');
  const opensNewTab = node.getAttribute('target') === '_blank';

  if (opensNewTab || (href && isExternalUrl(href))) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

DOMPurify.setConfig(PURIFY_CONFIG);

/**
 * Sanitize untrusted HTML for safe rendering or parsing.
 *
 * Strips everything outside the explicit allowlist in `SANITIZE_CONFIG`: only
 * a small set of formatting/structure tags and attributes survive, dangerous
 * URI schemes (javascript:, data:, vbscript:, ...) are removed from href/src,
 * and links are forced to `rel="noopener noreferrer"` when they open in a new
 * tab or point to an external URL.
 */
export function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }

  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/**
 * Check whether a URL is safe to use as an `href`, under the same URI-scheme
 * allowlist enforced by `sanitizeHtml` (blocks javascript:, data:, vbscript:, ...).
 */
export function isSafeHref(href: string): boolean {
  if (!href) {
    return false;
  }

  const normalized = href.replace(/[\s\t\r\n]/g, '');
  return DOMPurify.isValidAttribute('a', 'href', normalized);
}
