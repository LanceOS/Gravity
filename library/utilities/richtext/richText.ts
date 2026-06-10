import { DOMSerializer, Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { sanitizeHtml } from '../sanitizeHtml';

export interface RichTextDocumentJSON {
  type: 'doc';
  content?: unknown[];
}

export const EMPTY_RICH_TEXT_DOCUMENT: RichTextDocumentJSON = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const richTextNodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');

export const richTextSchema = new Schema({
  nodes: richTextNodes,
  marks: basicSchema.spec.marks,
});

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isRichTextDocumentJSON(value: unknown): value is RichTextDocumentJSON {
  return isObject(value) && value.type === 'doc' && Array.isArray(value.content);
}

export function createEmptyRichTextValue(): string {
  return JSON.stringify(EMPTY_RICH_TEXT_DOCUMENT);
}

export function createEmptyRichTextDoc(): ProseMirrorNode {
  return richTextSchema.nodeFromJSON(EMPTY_RICH_TEXT_DOCUMENT);
}

function parseJsonString(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeNode(node: ProseMirrorNode): ProseMirrorNode {
  return richTextSchema.nodeFromJSON(node.toJSON());
}

function stripLeadingEmptyHeading(node: ProseMirrorNode): ProseMirrorNode {
  const json = node.toJSON();
  if (!Array.isArray(json.content) || json.content.length === 0) {
    return node;
  }

  const [firstChild, ...rest] = json.content as Record<string, unknown>[];
  if (isObject(firstChild) && firstChild.type === 'heading' && (!Array.isArray(firstChild.content) || firstChild.content.length === 0)) {
    if (rest.length === 0) {
      return createEmptyRichTextDoc();
    }

    return richTextSchema.nodeFromJSON({
      ...json,
      content: rest,
    });
  }

  return node;
}

function parseMarkdownValue(raw: string): ProseMirrorNode {
  const normalizedRaw = raw.replace(/\]\(\s+/g, '](');
  return stripLeadingEmptyHeading(normalizeNode(defaultMarkdownParser.parse(normalizedRaw)));
}

export function parseRichTextValue(value?: string | null): ProseMirrorNode {
  if (typeof value !== 'string') {
    return createEmptyRichTextDoc();
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return createEmptyRichTextDoc();
  }

  const parsed = parseJsonString(value);
  if (isRichTextDocumentJSON(parsed)) {
    try {
      return richTextSchema.nodeFromJSON(parsed);
    } catch {
      // Fall through to Markdown parsing for malformed legacy data.
    }
  }

  try {
    return parseMarkdownValue(value);
  } catch {
    return createEmptyRichTextDoc();
  }
}

export function serializeRichTextJson(value: string | ProseMirrorNode): string {
  const doc = typeof value === 'string' ? parseRichTextValue(value) : value;
  return JSON.stringify(doc.toJSON());
}

export function isRichTextEmpty(value: string | ProseMirrorNode): boolean {
  const doc = typeof value === 'string' ? parseRichTextValue(value) : value;
  return (
    doc.childCount === 1 &&
    doc.firstChild?.type.name === 'paragraph' &&
    doc.firstChild.content.size === 0
  );
}

export function extractRichTextPlainText(value: string | ProseMirrorNode): string {
  const doc = typeof value === 'string' ? parseRichTextValue(value) : value;
  if (isRichTextEmpty(doc)) {
    return '';
  }

  return doc.textBetween(0, doc.content.size, ' ').replace(/\s+/g, ' ').trim();
}

export function serializeRichTextMarkdown(value: string | ProseMirrorNode): string {
  const doc = typeof value === 'string' ? parseRichTextValue(value) : value;
  if (isRichTextEmpty(doc)) {
    return '';
  }

  return defaultMarkdownSerializer.serialize(doc);
}

export function renderRichTextHtml(value: string | ProseMirrorNode): string {
  if (typeof document === 'undefined') {
    return '';
  }

  const doc = typeof value === 'string' ? parseRichTextValue(value) : value;
  if (isRichTextEmpty(doc)) {
    return '';
  }

  const serializer = DOMSerializer.fromSchema(richTextSchema);
  const wrapper = document.createElement('div');
  wrapper.appendChild(serializer.serializeFragment(doc.content, { document }));

  return sanitizeHtml(wrapper.innerHTML);
}
