import { DOMParser, Fragment, type Schema } from 'prosemirror-model';

// ProseMirror's clipboard context reconstructs nodes without parsing their DOM.
// Only the structural wrappers emitted by our schema's clipboard serializer
// belong here: accepting arbitrary node names/attributes would bypass HTML
// sanitization (and, for example, allow invalid ordered-list numbers back in).
const CONTEXT_NODES = new Set(['blockquote', 'bullet_list', 'ordered_list', 'list_item']);
const MAX_SLICE_DEPTH = 64;
const MAX_METADATA_LENGTH = 4096;

export function normalizeClipboardSliceMetadata(value: string): string | null {
  if (value.length > MAX_METADATA_LENGTH) return null;

  // The optional negative wrapper count used for tables is deliberately absent:
  // our schema has no tables, and the sanitizer removes those DOM wrappers.
  const match = /^(\d{1,2}) (\d{1,2}) (\[.*\])$/.exec(value);
  if (!match) return null;
  const openStart = Number(match[1]);
  const openEnd = Number(match[2]);
  if (openStart > MAX_SLICE_DEPTH || openEnd > MAX_SLICE_DEPTH) return null;

  let context: unknown;
  try {
    context = JSON.parse(match[3]);
  } catch {
    return null;
  }
  if (!Array.isArray(context) || context.length % 2 !== 0
    || context.length / 2 + Math.max(openStart, openEnd) > MAX_SLICE_DEPTH) return null;
  // The serializer strips context only while both sides are open.
  if (context.length && (openStart === 0 || openEnd === 0)) return null;

  const normalized: unknown[] = [];
  for (let index = 0; index < context.length; index += 2) {
    const name = context[index];
    const attrs: unknown = context[index + 1];
    if (typeof name !== 'string' || !CONTEXT_NODES.has(name)) return null;
    if (attrs !== null && (typeof attrs !== 'object' || Array.isArray(attrs))) return null;

    const keys = attrs === null ? [] : Object.keys(attrs);
    if (name === 'ordered_list' && keys.length === 1 && keys[0] === 'order') {
      const order = (attrs as { order: unknown }).order;
      if (typeof order !== 'number' || !Number.isInteger(order)
        || order < -2147483648 || order > 2147483647) return null;
      normalized.push(name, { order });
    } else {
      if (keys.length !== 0) return null;
      normalized.push(name, null);
    }
  }

  return `${openStart} ${openEnd} ${JSON.stringify(normalized)}`;
}

/** Check context against sanitized content before ProseMirror reconstructs it. */
export function validateClipboardSliceContext(root: HTMLElement, schema: Schema): void {
  const elements = Array.from(root.querySelectorAll('[data-pm-slice]'));
  const element = elements[0];
  const metadata = element?.getAttribute('data-pm-slice') ?? '';
  // serializeForClipboard writes one marker on the first top-level element.
  for (const candidate of elements) candidate.removeAttribute('data-pm-slice');
  if (!element || element !== root.firstChild) return;

  const normalized = normalizeClipboardSliceMetadata(metadata);
  if (!normalized) return;
  const [, start, end, contextJSON] = /^(\d+) (\d+) (.*)$/.exec(normalized)!;
  try {
    const slice = DOMParser.fromSchema(schema).parseSlice(root, { preserveWhitespace: true });
    if (Number(start) > slice.openStart || Number(end) > slice.openEnd) return;
    const context = JSON.parse(contextJSON) as (string | Record<string, number> | null)[];
    let content = slice.content;
    for (let index = context.length - 2; index >= 0; index -= 2) {
      const type = schema.nodes[context[index] as string];
      const attrs = context[index + 1] as Record<string, number> | null;
      // Open slices may omit a required first paragraph in a list item, so
      // validContent alone rejects legitimate selections. Check whether the
      // content can be completed, but keep the original partial fragment.
      if (!type || !type.createAndFill(attrs, content)) return;
      content = Fragment.from(type.create(attrs, content));
    }
    element.setAttribute('data-pm-slice', normalized);
  } catch {
    // Malformed context must fall back to ordinary sanitized HTML parsing.
  }
}
