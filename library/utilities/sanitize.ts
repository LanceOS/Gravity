import DOMPurify from 'dompurify';
import {
  ALLOWED_URI_REGEXP,
  DANGEROUS_URI_SCHEME_REGEXP,
  EXPLICITLY_FORBIDDEN_ATTRIBUTES,
  EXPLICITLY_FORBIDDEN_TAGS,
  HTML_SANITIZATION_POLICY,
  isAttributeAllowedForTag,
  isExternalUrl,
  isSafeOrderedListStart,
  isSafeSanitizationUri,
  normalizeUriForSchemeValidation,
  REQUIRED_SAFE_REL_TOKENS,
  withSafeRelTokens,
} from '../../server/src/lib/html-sanitization-policy';

/**
 * The DOM-free policy itself lives in the server library so the API and
 * browser adapters consume exactly the same allowlist. This browser adapter
 * owns DOMPurify hooks and public browser-facing helpers. Do not call
 * DOMPurify directly outside this file.
 */
export interface SanitizeHtmlConfig {
  /** Explicit tag allowlist. Anything not listed here is stripped. */
  readonly allowedTags: readonly string[];
  /** Explicit attribute allowlist. Anything not listed here is stripped. */
  readonly allowedAttributes: readonly string[];
  /** URI schemes permitted in href/src attributes. Everything else - including javascript:, data:, and vbscript: - is stripped. */
  readonly allowedUriSchemes: readonly string[];
}

export const SANITIZE_CONFIG: SanitizeHtmlConfig = HTML_SANITIZATION_POLICY;

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [...SANITIZE_CONFIG.allowedTags],
  ALLOWED_ATTR: [...SANITIZE_CONFIG.allowedAttributes],
  ALLOWED_URI_REGEXP,
  FORBID_TAGS: [...EXPLICITLY_FORBIDDEN_TAGS],
  FORBID_ATTR: [...EXPLICITLY_FORBIDDEN_ATTRIBUTES],
  ALLOW_DATA_ATTR: false,
};

// Hooks are registered on DOMPurify's shared singleton, so re-evaluating this
// module (e.g. Vite HMR) would otherwise stack duplicate hooks indefinitely.
// This is the only file allowed to touch DOMPurify hooks/config, so a clean
// slate here is safe.
DOMPurify.removeAllHooks();

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  const tag = node.tagName.toLowerCase();

  if (!isAttributeAllowedForTag(tag, data.attrName)) {
    data.keepAttr = false;
    return;
  }

  if (data.attrName === 'start' && !isSafeOrderedListStart(data.attrValue)) {
    data.keepAttr = false;
  }

  // DOMPurify allows data: URIs on img/audio/video `src` by default even when
  // ALLOWED_URI_REGEXP would otherwise reject them. Explicitly reject the
  // schemes we never want on href/src, regardless of tag, as defense-in-depth
  // on top of ALLOWED_URI_REGEXP.
  if (
    (data.attrName === 'href' || data.attrName === 'src')
    && DANGEROUS_URI_SCHEME_REGEXP.test(normalizeUriForSchemeValidation(data.attrValue))
  ) {
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
    node.setAttribute('rel', withSafeRelTokens(node.getAttribute('rel')));
  }
});

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
 * Sanitize untrusted HTML for assignment to an HTML sink protected by
 * `require-trusted-types-for 'script'`.
 *
 * DOMPurify creates and uses its `dompurify` Trusted Types policy when the
 * browser supports Trusted Types, so the CSP must allow that policy name. In
 * browsers without that API it falls back to a string, so callers can use this
 * function without feature detection.
 *
 * Keep the configuration per-call instead of using `DOMPurify.setConfig()`:
 * once a global config is set, DOMPurify deliberately ignores all per-call
 * config, including `RETURN_TRUSTED_TYPE`.
 */
export function sanitizeTrustedHtml(html: string): TrustedHTML {
  return DOMPurify.sanitize(html || '', {
    ...PURIFY_CONFIG,
    RETURN_TRUSTED_TYPE: true,
  });
}

/**
 * Check whether a URL is safe to use as an `href`, under the same URI-scheme
 * allowlist enforced by `sanitizeHtml` (blocks javascript:, data:, vbscript:, ...).
 */
export function isSafeHref(href: string): boolean {
  return isSafeSanitizationUri(href);
}

/**
 * The `rel` value forced onto every external link. `noreferrer` alone implies
 * `noopener` in modern browsers, but we set both tokens explicitly so the policy
 * is unambiguous and matches what `sanitizeHtml` writes on the HTML-string path.
 */
export const SAFE_EXTERNAL_LINK_REL = REQUIRED_SAFE_REL_TOKENS.join(' ');

export interface SafeExternalLinkProps {
  readonly href: string;
  readonly target: '_blank';
  readonly rel: string;
}

/**
 * Build the href/target/rel props for rendering an untrusted URL as an external
 * link in React (the JSX render path). This is the single source of truth for
 * link safety when we render anchors as React elements rather than sanitized
 * HTML, and it mirrors the policy `sanitizeHtml` enforces on the HTML-string
 * path: unsafe schemes (javascript:, data:, vbscript:, ...) fall back to
 * `fallbackHref`, the link opens in a new tab, and `rel` is forced to
 * `noopener noreferrer`.
 *
 * `href` is treated as untrusted and validated through `isSafeHref`.
 * `fallbackHref` is NOT validated - it is used verbatim when `href` is unsafe or
 * missing, so callers must pass a trusted, known-safe constant (e.g. the default
 * `about:blank`, or `'#'`), never user-derived input.
 */
export function safeExternalLinkProps(
  href: string | null | undefined,
  fallbackHref = 'about:blank',
): SafeExternalLinkProps {
  return {
    href: href && isSafeHref(href) ? href : fallbackHref,
    target: '_blank',
    rel: SAFE_EXTERNAL_LINK_REL,
  };
}
