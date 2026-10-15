import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false });

function richText(body: string): string | null {
  let document: unknown;
  try { document = JSON.parse(body); } catch { return null; }
  if (!document || typeof document !== 'object' || Array.isArray(document) ||
      (document as { type?: unknown }).type !== 'doc' ||
      !Array.isArray((document as { content?: unknown }).content)) return null;

  const block = new Set(['doc', 'blockquote', 'bullet_list', 'ordered_list', 'list_item']);
  const visit = (node: unknown): string => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return '';
    const value = node as { text?: unknown; type?: unknown; content?: unknown };
    if (typeof value.text === 'string') return value.text;
    if (value.type === 'hard_break') return ' ';
    if (!Array.isArray(value.content)) return '';
    const parts = value.content.map(visit);
    return parts.join(block.has(String(value.type)) ? ' ' : '');
  };
  return visit(document).replace(/\s+/g, ' ').trim();
}

/** The search source is the entire visible body, never the shortened preview. */
export function noteSearchText(body: string): string {
  const rich = richText(body);
  if (rich !== null) return rich;
  const inlineText = (tokens: ReturnType<typeof markdown.parse>): string => tokens.map(token => {
    if (token.type === 'image') return token.content;
    if (token.children?.length) return inlineText(token.children);
    if (token.type === 'text' || token.type === 'code_inline') return token.content;
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    return '';
  }).join('');
  const fragments = markdown.parse(body, {}).flatMap(token => {
    if (token.type === 'inline') return [inlineText(token.children ?? [])];
    if (token.type === 'code_block' || token.type === 'fence') return [token.content];
    return [];
  });
  return fragments.join(' ').replace(/\s+/g, ' ').trim();
}

export function noteExcerpt(searchText: string): string {
  return searchText.length > 500 ? `${searchText.slice(0, 500)}...` : searchText;
}

export function searchSnippet(searchText: string, query: string): string {
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  const lower = searchText.toLocaleLowerCase();
  const matches = terms.map(term => lower.indexOf(term.toLocaleLowerCase())).filter(index => index >= 0);
  const start = Math.max(0, (matches.length ? Math.min(...matches) : 0) - 70);
  const snippet = searchText.slice(start, start + 200).trim();
  return `${start ? '…' : ''}${snippet}${start + 200 < searchText.length ? '…' : ''}`;
}

export function highlightedSnippet(headline: string, title: string, query: string): string {
  const match = headline.indexOf('⟦');
  if (match < 0) return searchSnippet(title, query);
  const text = headline.replace(/[⟦⟧]/g, '');
  const start = Math.max(0, match - 70);
  const snippet = text.slice(start, start + 200).trim();
  return `${start ? '…' : ''}${snippet}${start + 200 < text.length ? '…' : ''}`;
}
