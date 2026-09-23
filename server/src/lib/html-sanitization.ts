import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import MarkdownIt from 'markdown-it';
import { defaultMarkdownParser } from 'prosemirror-markdown';
import { DOMParser as ProseMirrorDOMParser, Fragment } from 'prosemirror-model';
import { richTextSchema } from './rich-text-schema.js';
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
  withSafeRelTokens,
} from './html-sanitization-policy.js';

/**
 * Server-side DOMPurify adapter for content written by the rich-text editor.
 *
 * The policy is deliberately DOM-independent and shared with the browser
 * adapter. This module only supplies the JSDOM-backed DOMPurify instance and
 * understands the ProseMirror JSON envelope used for persisted editor values.
 */
const serverWindow = new JSDOM('').window;
const DOMPurify = createDOMPurify(serverWindow);
const markdownWithHtml = new MarkdownIt('commonmark', { html: true });
for (const type of ['code_block', 'fence']) {
  const render = markdownWithHtml.renderer.rules[type]!;
  // CommonMark tokens include a terminating line break that the browser's
  // Markdown parser omits from the code node. Avoid adding it on HTML import.
  markdownWithHtml.renderer.rules[type] = (...args) => render(...args)
    .replace(/\n<\/code><\/pre>\n$/, '</code></pre>\n');
}
const editorHtmlParser = new ProseMirrorDOMParser(richTextSchema, [
  {
    tag: 'code',
    mark: 'code',
    // HTML whitespace collapsing must not change Markdown's literal code.
    getContent: (node, schema) => node.textContent
      ? Fragment.from(schema.text(node.textContent))
      : Fragment.empty,
  },
  ...ProseMirrorDOMParser.fromSchema(richTextSchema).rules,
]);

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [...HTML_SANITIZATION_POLICY.allowedTags],
  ALLOWED_ATTR: [...HTML_SANITIZATION_POLICY.allowedAttributes],
  ALLOWED_URI_REGEXP,
  FORBID_TAGS: [...EXPLICITLY_FORBIDDEN_TAGS],
  FORBID_ATTR: [...EXPLICITLY_FORBIDDEN_ATTRIBUTES],
  ALLOW_DATA_ATTR: false,
};

const ALLOWED_TAGS: ReadonlySet<string> = new Set(HTML_SANITIZATION_POLICY.allowedTags);
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set(HTML_SANITIZATION_POLICY.allowedAttributes);

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  const tag = node.tagName.toLowerCase();

  if (!isAttributeAllowedForTag(tag, data.attrName)) {
    data.keepAttr = false;
    return;
  }

  if (data.attrName === 'start' && !isSafeOrderedListStart(data.attrValue)) {
    data.keepAttr = false;
  }

  // DOMPurify allows data: URIs on image sources by default. Explicitly reject
  // the dangerous schemes that are blocked by the browser policy as well.
  if (
    (data.attrName === 'href' || data.attrName === 'src')
    && DANGEROUS_URI_SCHEME_REGEXP.test(normalizeUriForSchemeValidation(data.attrValue))
  ) {
    data.keepAttr = false;
  }
});

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

export type EditorContentFormat = 'html_or_text' | 'markdown' | 'prosemirror_json';

export interface EditorContentSanitizationResult {
  /** Content safe to persist. */
  readonly content: string;
  /** Format selected so audit events can be analyzed without logging content. */
  readonly format: EditorContentFormat;
  /** Whether unsafe material was removed rather than merely normalized. */
  readonly stripped: boolean;
  /** Number of dangerous elements, attributes, marks, or nodes removed. */
  readonly strippedCount: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProseMirrorDocument(value: unknown): value is JsonRecord {
  return isRecord(value) && value.type === 'doc' && Array.isArray(value.content);
}

function normalizeProseMirrorDocument(document: JsonRecord): JsonRecord {
  if (Array.isArray(document.content) && document.content.length > 0) {
    return document;
  }

  // A ProseMirror doc requires block+; stripping a top-level unsafe node must
  // not leave data that the client rejects and falls back to Markdown parsing.
  return {
    ...document,
    content: [{ type: 'paragraph' }],
  };
}

function isCanonicalEmptyProseMirrorDocument(document: JsonRecord): boolean {
  const content = document.content;
  if (!Array.isArray(content) || content.length !== 1 || !isRecord(content[0])) {
    return false;
  }

  const onlyChild = content[0];
  return onlyChild.type === 'paragraph'
    && (!Array.isArray(onlyChild.content) || onlyChild.content.length === 0);
}

type SanitizedJsonValue = {
  readonly value: JsonRecord | null;
  readonly strippedCount: number;
};

const PROSEMIRROR_NODE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  heading: ['level'],
  image: ['src', 'alt', 'title'],
  ordered_list: ['order'],
};

const PROSEMIRROR_MARK_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  link: ['href', 'title'],
};

function stripUnsupportedProseMirrorAttributes(
  value: JsonRecord,
  allowedAttributes: readonly string[],
): { readonly attrs: JsonRecord | undefined; readonly strippedCount: number } {
  if (value.attrs === undefined) {
    return { attrs: undefined, strippedCount: 0 };
  }

  if (!isRecord(value.attrs)) {
    return { attrs: undefined, strippedCount: 1 };
  }

  const attrs: JsonRecord = {};
  let strippedCount = 0;
  for (const [name, attributeValue] of Object.entries(value.attrs)) {
    if (allowedAttributes.includes(name)) {
      attrs[name] = attributeValue;
    } else {
      strippedCount += 1;
    }
  }

  const sanitizedAttrs = strippedCount === 0
    ? value.attrs
    : Object.keys(attrs).length === 0
      ? undefined
      : attrs;

  return { attrs: sanitizedAttrs, strippedCount };
}

/**
 * Sanitize URI-bearing ProseMirror structures without passing the JSON string
 * itself to DOMPurify. Rich text is persisted as JSON, so string sanitization
 * alone would miss a malicious `link.attrs.href` or `image.attrs.src`.
 */
function sanitizeProseMirrorNode(value: JsonRecord): SanitizedJsonValue {
  // ProseMirror coerces JSON type values when looking up schema nodes/marks.
  // Reject malformed types before a value such as ['image'] can bypass the
  // string comparisons that enforce URI safety below.
  if (typeof value.type !== 'string') {
    return { value: null, strippedCount: 1 };
  }

  let strippedCount = 0;
  const next: JsonRecord = { ...value };

  if (value.type === 'image') {
    const attrs = isRecord(value.attrs) ? value.attrs : null;
    const src = attrs?.src;

    // Image src is required by ProseMirror's schema. Drop the node rather than
    // producing an invalid document when its source is unsafe or missing.
    if (typeof src !== 'string' || !isSafeSanitizationUri(src)) {
      return { value: null, strippedCount: 1 };
    }
  }

  const sanitizedNodeAttributes = stripUnsupportedProseMirrorAttributes(
    value,
    Object.hasOwn(PROSEMIRROR_NODE_ATTRIBUTES, value.type as string)
      ? PROSEMIRROR_NODE_ATTRIBUTES[value.type as string]
      : [],
  );
  strippedCount += sanitizedNodeAttributes.strippedCount;
  if (sanitizedNodeAttributes.strippedCount > 0) {
    if (sanitizedNodeAttributes.attrs === undefined) {
      delete next.attrs;
    } else {
      next.attrs = sanitizedNodeAttributes.attrs;
    }
  }

  if (Array.isArray(value.marks)) {
    const marks: unknown[] = [];
    for (const mark of value.marks) {
      if (!isRecord(mark)) {
        marks.push(mark);
        continue;
      }

      if (typeof mark.type !== 'string') {
        strippedCount += 1;
        continue;
      }

      if (mark.type === 'link') {
        const attrs = isRecord(mark.attrs) ? mark.attrs : null;
        const href = attrs?.href;
        // href is required by the ProseMirror link mark. Removing the complete
        // mark keeps its text while preventing an invalid link mark from being
        // persisted and later rendered.
        if (typeof href !== 'string' || !isSafeSanitizationUri(href)) {
          strippedCount += 1;
          continue;
        }
      }

      const sanitizedMarkAttributes = stripUnsupportedProseMirrorAttributes(
        mark,
        Object.hasOwn(PROSEMIRROR_MARK_ATTRIBUTES, mark.type as string)
          ? PROSEMIRROR_MARK_ATTRIBUTES[mark.type as string]
          : [],
      );
      strippedCount += sanitizedMarkAttributes.strippedCount;
      if (sanitizedMarkAttributes.strippedCount === 0) {
        marks.push(mark);
      } else if (sanitizedMarkAttributes.attrs === undefined) {
        const sanitizedMark = { ...mark };
        delete sanitizedMark.attrs;
        marks.push(sanitizedMark);
      } else {
        marks.push({ ...mark, attrs: sanitizedMarkAttributes.attrs });
      }
    }
    next.marks = marks;
  }

  if (Array.isArray(value.content)) {
    const content: unknown[] = [];
    for (const child of value.content) {
      if (!isRecord(child)) {
        content.push(child);
        continue;
      }

      const sanitizedChild = sanitizeProseMirrorNode(child);
      strippedCount += sanitizedChild.strippedCount;
      if (sanitizedChild.value) {
        content.push(sanitizedChild.value);
      }
    }
    next.content = content;
  }

  return { value: next, strippedCount };
}

function countDangerousHtmlInput(content: string): number {
  // Inspect a separate inert document so audit detection can distinguish real
  // stripping from JSDOM's harmless HTML normalization. JSDOM does not execute
  // scripts under its default configuration.
  const document = serverWindow.document.implementation.createHTMLDocument('');
  document.body.innerHTML = content;

  let dangerousCount = 0;
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      dangerousCount += 1;
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name) || !isAttributeAllowedForTag(tag, name)) {
        dangerousCount += 1;
        continue;
      }

      if (name === 'start' && !isSafeOrderedListStart(attribute.value)) {
        dangerousCount += 1;
      }

      if (
        attribute.value
        && (name === 'href' || name === 'src')
        && !isSafeSanitizationUri(attribute.value)
      ) {
        dangerousCount += 1;
      }
    }
  }

  return dangerousCount;
}

function countDomPurifyRemovals(): number {
  // DOMPurify exposes removal diagnostics, but JSDOM adds a synthetic BODY
  // entry for every fragment. Ignore only that known wrapper.
  return DOMPurify.removed.filter((removed) => {
    if (!('element' in removed)) {
      return true;
    }

    return removed.element.nodeName !== 'BODY';
  }).length;
}

function sanitizeHtml(content: string): EditorContentSanitizationResult {
  const dangerousInputCount = countDangerousHtmlInput(content);
  const sanitized = DOMPurify.sanitize(content, PURIFY_CONFIG);
  // DOMPurify's diagnostics cover parser edge cases, while the pre-scan covers
  // script tags JSDOM removes before DOMPurify can report them. Both paths omit
  // the synthetic BODY wrapper and avoid logging safe rel/target normalization.
  const strippedCount = Math.max(dangerousInputCount, countDomPurifyRemovals());

  return {
    content: sanitized,
    format: 'html_or_text',
    stripped: strippedCount > 0,
    strippedCount,
  };
}

function parseMarkdownDocument(content: string): JsonRecord {
  // Match the browser's legacy Markdown parser and normalize to its schema.
  const markdown = defaultMarkdownParser.parse(content.replace(/\]\(\s+/g, ']('));
  return richTextSchema.nodeFromJSON(markdown.toJSON()).toJSON();
}

function sanitizeMarkdownOrHtml(content: string): EditorContentSanitizationResult {
  const markdown = content.replace(/\]\(\s+/g, '](');
  const tokens = markdownWithHtml.parse(markdown, {});
  const containsHtml = tokens.some((token) => token.type === 'html_block'
    || token.children?.some((child) => child.type === 'html_inline'));

  if (!containsHtml) {
    const sanitized = sanitizeProseMirrorNode(parseMarkdownDocument(content));
    return {
      // Keep safe Markdown byte-for-byte, including code fences, autolinks,
      // and literal ampersands. Only rewrite it when a URI must be removed.
      content: sanitized.strippedCount > 0
        ? JSON.stringify(normalizeProseMirrorDocument(sanitized.value as JsonRecord))
        : content,
      format: 'markdown',
      stripped: sanitized.strippedCount > 0,
      strippedCount: sanitized.strippedCount,
    };
  }

  // Parse Markdown before HTML sanitization: code examples and autolinks are
  // escaped/rendered by the parser, while actual HTML remains subject to the
  // allowlist. Sanitizing isolated HTML tokens would break paired inline tags.
  const html = markdownWithHtml.renderer.render(tokens, markdownWithHtml.options, {});
  const sanitized = sanitizeHtml(html);
  const document = serverWindow.document.implementation.createHTMLDocument('');
  document.body.innerHTML = sanitized.content;
  const editorDocument = editorHtmlParser.parse(document.body);

  // HTML and mixed content become editor JSON so the client does not parse
  // escaped code as Markdown again (which would display entities literally).
  return { ...sanitized, content: JSON.stringify(editorDocument.toJSON()) };
}

/**
 * Sanitize an editor value before persistence.
 *
 * Raw/legacy HTML goes through server-side DOMPurify after Markdown parsing.
 * Safe Markdown is retained verbatim. Standard editor values
 * are ProseMirror JSON, whose text remains literal/inert but whose link and
 * image URI attributes are validated against the same URI policy. This avoids
 * corrupting valid JSON while closing the direct-API bypass around URI attrs.
 */
export function sanitizeEditorContent(content: string): EditorContentSanitizationResult {
  if (!content) {
    return {
      content: '',
      format: 'html_or_text',
      stripped: false,
      strippedCount: 0,
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (isProseMirrorDocument(parsed)) {
      const sanitized = sanitizeProseMirrorNode(parsed);
      // The root is known to be a valid record and is never removed.
      const normalized = normalizeProseMirrorDocument(sanitized.value as JsonRecord);
      return {
        content: JSON.stringify(normalized),
        format: 'prosemirror_json',
        stripped: sanitized.strippedCount > 0,
        strippedCount: sanitized.strippedCount,
      };
    }
  } catch {
    // Non-JSON editor input is handled as raw/legacy HTML or plain text below.
  }

  return sanitizeMarkdownOrHtml(content);
}

/**
 * Whether an already-sanitized editor value is empty for comment validation.
 *
 * For ProseMirror JSON, this deliberately mirrors the browser's
 * `isRichTextEmpty`: only the canonical document containing one empty
 * paragraph is empty. A valid non-text block such as a horizontal rule must
 * remain a valid comment even when a neighboring unsafe node was stripped.
 */
export function isSanitizedEditorContentEmpty(content: string): boolean {
  if (!content.trim()) {
    return true;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (isProseMirrorDocument(parsed)) {
      return isCanonicalEmptyProseMirrorDocument(parsed);
    }
  } catch {
    // Treat non-JSON content as Markdown below.
  }

  // HTML was converted to JSON during sanitization; remaining strings use
  // the same Markdown interpretation as the editor, including autolinks.
  return isCanonicalEmptyProseMirrorDocument(parseMarkdownDocument(content));
}
