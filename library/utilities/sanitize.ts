import DOMPurify from 'dompurify';
import type { TrustedTypePolicy } from 'trusted-types';
import type { Schema } from 'prosemirror-model';
import { normalizeClipboardSliceMetadata, validateClipboardSliceContext } from './richtext/clipboardMetadata';

/**
 * Centralized HTML sanitization policy. This is the single source of truth
 * for what HTML survives sanitization anywhere in the app (rich text paste,
 * rendered rich text, markdown-derived links, AI output, etc). Do not call
 * DOMPurify directly outside this file - route all sanitization through
 * `sanitizeHtml` / `sanitizeTrustedHtml` / `isSafeHref` / `safeExternalLinkProps`
 * so the policy stays in one auditable place.
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
    'p', 'br', 'hr', 'img',
  ],
  allowedAttributes: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'start'],
  allowedUriSchemes: ['http', 'https', 'mailto'],
};

// Called out explicitly for auditability, even though the allowlists above
// already exclude these by construction (anything not allowlisted is dropped).
const EXPLICITLY_FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'];
const EXPLICITLY_FORBIDDEN_ATTRIBUTES = ['style', 'onclick', 'onerror', 'onload', 'onmouseover'];

// Attributes that only make sense on a specific tag. Anything not listed here
// (e.g. class, title) is allowed on any tag from SANITIZE_CONFIG.allowedTags.
const ATTRIBUTE_TAG_SCOPE: Partial<Record<string, readonly string[]>> = {
  href: ['a'],
  target: ['a'],
  rel: ['a'],
  src: ['img'],
  alt: ['img'],
  start: ['ol'],
};

function isAttributeAllowedForTag(tag: string, attrName: string): boolean {
  const scopedTags = ATTRIBUTE_TAG_SCOPE[attrName];
  return !scopedTags || scopedTags.includes(tag);
}

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

const REQUIRED_SAFE_REL_TOKENS = ['noopener', 'noreferrer'];

// Adds the required safe-navigation tokens to whatever `rel` the author
// already supplied (e.g. `rel="me"`) instead of clobbering it.
function withSafeRelTokens(existingRel: string | null): string {
  const tokens = new Set((existingRel ?? '').split(/\s+/).filter(Boolean));
  REQUIRED_SAFE_REL_TOKENS.forEach((token) => tokens.add(token));
  return Array.from(tokens).join(' ');
}

// Keep URI validation aligned with DOMPurify's ATTR_WHITESPACE expression.
// URL parsers ignore these characters around (and, for some characters, in)
// schemes, so a value such as `\u0000javascript:` must not be treated as a
// harmless relative URL by the JSX-rendering path.
// eslint-disable-next-line no-control-regex -- mirrors DOMPurify ATTR_WHITESPACE.
const URI_CONTROL_OR_WHITESPACE_REGEXP = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g;
const DANGEROUS_URI_SCHEME_REGEXP = /^(?:javascript|data|vbscript):/i;

function normalizeUriForSchemeValidation(uri: string): string {
  return uri.replace(URI_CONTROL_OR_WHITESPACE_REGEXP, '');
}

// Hooks are registered on DOMPurify's shared singleton, so re-evaluating this
// module (e.g. Vite HMR) would otherwise stack duplicate hooks indefinitely.
// This is the only file allowed to touch DOMPurify hooks/config, so a clean
// slate here is safe.
DOMPurify.removeAllHooks();

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  const tag = node.tagName.toLowerCase();

  if (data.attrName === 'data-pm-slice') {
    const metadata = normalizeClipboardSliceMetadata(data.attrValue);
    if (metadata === null) data.keepAttr = false;
    else data.attrValue = metadata;
    // Only sanitizeRichTextClipboardHtml allows this attribute in its config.
    return;
  }

  if (!isAttributeAllowedForTag(tag, data.attrName)) {
    data.keepAttr = false;
    return;
  }

  if (data.attrName === 'start') {
    // ProseMirror coerces this attribute with Number(), so malformed values
    // become NaN/Infinity and serialize as null, making the saved doc invalid.
    // Match the signed 32-bit integer range of HTMLOListElement.start and
    // normalize accepted decimal values before they reach the document model.
    const value = data.attrValue.trim();
    const order = Number(value);
    if (!/^[+-]?\d+$/.test(value) || !Number.isInteger(order) || order < -2147483648 || order > 2147483647) {
      data.keepAttr = false;
    } else {
      data.attrValue = String(order);
    }
    return;
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

  // A createPolicy.createHTML callback must return a string. Keep this explicit
  // and per-call; DOMPurify.setConfig() would override per-call options.
  return DOMPurify.sanitize(html, { ...PURIFY_CONFIG, RETURN_TRUSTED_TYPE: false });
}

export const EDITOR_HTML_POLICY_NAME = 'gravity-editor';

/** Sanitize ProseMirror clipboard HTML while retaining validated slice context. */
export function sanitizeRichTextClipboardHtml(html: string, schema: Schema): string {
  if (!html) return '';
  const root = DOMPurify.sanitize(html, {
    ...PURIFY_CONFIG,
    ADD_ATTR: ['data-pm-slice'],
    RETURN_DOM: true,
    RETURN_TRUSTED_TYPE: false,
  });
  validateClipboardSliceContext(root as HTMLElement, schema);
  return (root as HTMLElement).innerHTML;
}

interface EditorHtmlPolicyState {
  policy?: Pick<TrustedTypePolicy, 'createHTML'>;
  sanitize: typeof sanitizeHtml;
}

// Policy names cannot be registered twice under our CSP. Keep the policy over
// Vite hot updates, but route its callback through the current sanitizer so
// edits to the allowlist take effect without retaining an outdated closure.
const hotData = import.meta.hot?.data;
const editorHtmlPolicyState: EditorHtmlPolicyState = hotData?.editorHtmlPolicyState
  ?? { sanitize: sanitizeHtml };
editorHtmlPolicyState.sanitize = sanitizeHtml;
if (hotData) {
  hotData.editorHtmlPolicyState = editorHtmlPolicyState;
}

/**
 * Sanitize untrusted HTML for assignment to an HTML sink protected by
 * `require-trusted-types-for 'script'`.
 *
 * The browser wraps only the DOMPurify-sanitized string in TrustedHTML. CSP
 * must allow `gravity-editor` and DOMPurify's internal `dompurify` parsing
 * policy. Never pass this wrapping policy back to DOMPurify: that would recurse.
 * Browsers without the API get the same sanitized HTML as a string. Policy
 * creation errors deliberately propagate instead of downgrading enforcement.
 */
export function sanitizeTrustedHtml(html: string): string | TrustedHTML {
  const trustedTypes = typeof window !== 'undefined' ? window.trustedTypes : undefined;
  if (typeof trustedTypes?.createPolicy !== 'function') {
    return sanitizeHtml(html);
  }

  editorHtmlPolicyState.policy ??= trustedTypes.createPolicy(EDITOR_HTML_POLICY_NAME, {
    createHTML: (input: string) => editorHtmlPolicyState.sanitize(input),
  });
  return editorHtmlPolicyState.policy.createHTML(html || '');
}

/**
 * Check whether a URL is safe to use as an `href`, under the same URI-scheme
 * allowlist enforced by `sanitizeHtml` (blocks javascript:, data:, vbscript:, ...).
 */
export function isSafeHref(href: string): boolean {
  if (!href) {
    return false;
  }

  const normalized = normalizeUriForSchemeValidation(href);
  return !DANGEROUS_URI_SCHEME_REGEXP.test(normalized) && ALLOWED_URI_REGEXP.test(normalized);
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
