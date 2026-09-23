import DOMPurify from 'dompurify';
import type { TrustedTypePolicy } from 'trusted-types';
import type { Schema } from 'prosemirror-model';
import { normalizeClipboardSliceMetadata, validateClipboardSliceContext } from './richtext/clipboardMetadata';
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
 * owns DOMPurify hooks, the editor Trusted Types policy, and public browser
 * helpers. Do not call DOMPurify directly outside this file.
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
    if (!isSafeOrderedListStart(value) || order < -2147483648 || order > 2147483647) {
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
  // ProseMirror restores browser-generated spaces after parsing clipboard HTML.
  // Match that behavior before DOMPurify removes span wrappers and their style
  // attributes, which distinguish converted spaces from intentional NBSPs.
  const webkit = typeof document !== 'undefined'
    && 'webkitFontSmoothing' in document.documentElement.style;
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const chrome = /Chrome\/\d+/.test(userAgent)
    && !/Edge\/\d+|MSIE \d|Trident\//.test(userAgent);
  const selector = chrome ? 'span:not([class]):not([style])' : 'span.Apple-converted-space';
  const restoreSpaces = (node: Node) => {
    if (webkit && node.nodeType === 1 && node.nodeName === 'SPAN' && (node as Element).matches(selector)
      && node.childNodes.length === 1 && node.textContent === '\u00a0') {
      node.textContent = ' ';
    }
  };

  DOMPurify.addHook('beforeSanitizeElements', restoreSpaces);
  try {
    const root = DOMPurify.sanitize(html, {
      ...PURIFY_CONFIG,
      ADD_ATTR: ['data-pm-slice'],
      RETURN_DOM: true,
      RETURN_TRUSTED_TYPE: false,
    });
    validateClipboardSliceContext(root as HTMLElement, schema);
    return (root as HTMLElement).innerHTML;
  } finally {
    // Sanitization is synchronous. Never leave this clipboard-only hook active
    // for generic HTML sinks, even when sanitization or schema parsing throws.
    DOMPurify.removeHook('beforeSanitizeElements', restoreSpaces);
  }
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
