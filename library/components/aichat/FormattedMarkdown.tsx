import React, { useMemo, useState } from 'react';
import { CheckSquare, Square, Clipboard, Check } from 'lucide-react';
import { isSafeHref } from '../../utilities/sanitize';

export interface FormattedMarkdownProps {
  text: string;
  customTokenRegex?: RegExp;
  renderCustomToken?: (match: RegExpMatchArray, key: number) => React.ReactNode | null;
  tone?: 'default' | 'accent' | 'danger';
}

interface MarkdownToneStyles {
  textPrimary: string;
  textSecondary: string;
  accent: string;
  border: string;
  surface: string;
  surfaceMuted: string;
  surfaceSubtle: string;
  inlineCodeBackground: string;
  iconMuted: string;
}

const MARKDOWN_TONES: Record<NonNullable<FormattedMarkdownProps['tone']>, MarkdownToneStyles> = {
  default: {
    textPrimary: 'var(--color-text-primary)',
    textSecondary: 'var(--color-text-secondary)',
    accent: 'var(--color-primary)',
    border: 'var(--color-border-default)',
    surface: 'var(--color-surface-card)',
    surfaceMuted: 'var(--color-surface-app)',
    surfaceSubtle: 'var(--color-base50)',
    inlineCodeBackground: 'var(--color-base100)',
    iconMuted: 'var(--color-text-disabled)',
  },
  accent: {
    textPrimary: 'var(--color-text-on-accent)',
    textSecondary: 'color-mix(in srgb, var(--color-text-on-accent) 78%, transparent)',
    accent: 'var(--color-text-on-accent)',
    border: 'color-mix(in srgb, var(--color-text-on-accent) 18%, transparent)',
    surface: 'color-mix(in srgb, var(--color-text-on-accent) 8%, transparent)',
    surfaceMuted: 'color-mix(in srgb, var(--color-text-on-accent) 12%, transparent)',
    surfaceSubtle: 'color-mix(in srgb, var(--color-text-on-accent) 10%, transparent)',
    inlineCodeBackground: 'color-mix(in srgb, var(--color-text-on-accent) 14%, transparent)',
    iconMuted: 'color-mix(in srgb, var(--color-text-on-accent) 68%, transparent)',
  },
  danger: {
    textPrimary: 'var(--color-text-error)',
    textSecondary: 'color-mix(in srgb, var(--color-text-error) 72%, var(--color-text-secondary))',
    accent: 'var(--color-text-error)',
    border: 'var(--color-border-error)',
    surface: 'color-mix(in srgb, var(--color-bg-error) 86%, var(--color-surface-card))',
    surfaceMuted: 'color-mix(in srgb, var(--color-bg-error) 92%, var(--color-surface-card))',
    surfaceSubtle: 'color-mix(in srgb, var(--color-bg-error) 78%, var(--color-surface-card))',
    inlineCodeBackground: 'color-mix(in srgb, var(--color-bg-error) 72%, var(--color-surface-card))',
    iconMuted: 'color-mix(in srgb, var(--color-text-error) 66%, var(--color-text-secondary))',
  },
};

interface InlineFormattedTextProps extends Omit<FormattedMarkdownProps, 'tone'> {
  toneStyles: MarkdownToneStyles;
}

function InlineFormattedText({ text, customTokenRegex, renderCustomToken, toneStyles }: InlineFormattedTextProps) {
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;
  let lastIndex = 0;

  const combinedRegex = useMemo(() => {
    let pattern = '\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*|_([^_]+)_|`([^`]+)`|\\[([^\\]]+)\\]\\(([^)]+)\\)';

    if (customTokenRegex) {
      pattern += `|${customTokenRegex.source}`;
    }

    return new RegExp(pattern, 'gi');
  }, [customTokenRegex]);

  const matches = Array.from(text.matchAll(combinedRegex));

  for (const match of matches) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(<span key={keyIndex++}>{text.substring(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      parts.push(
        <strong key={keyIndex++} style={{ color: toneStyles.textPrimary, fontWeight: 600 }}>
          {match[1]}
        </strong>,
      );
    } else if (match[2]) {
      parts.push(
        <em key={keyIndex++}>
          {match[2]}
        </em>,
      );
    } else if (match[3]) {
      parts.push(
        <em key={keyIndex++}>
          {match[3]}
        </em>,
      );
    } else if (match[4]) {
      parts.push(
        <code
          key={keyIndex++}
          style={{
            background: toneStyles.inlineCodeBackground,
            padding: '2px 4px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'var(--mono)',
            color: toneStyles.accent,
          }}
        >
          {match[4]}
        </code>,
      );
    } else if (match[5] && match[6]) {
      const safeHref = isSafeHref(match[6]) ? match[6] : 'about:blank';
      parts.push(
        <a
          key={keyIndex++}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: toneStyles.accent, textDecoration: 'underline', textDecorationColor: 'currentColor' }}
          className="clickable"
        >
          {match[5]}
        </a>,
      );
    } else if (renderCustomToken) {
      const customNode = renderCustomToken(match, keyIndex);

      if (customNode) {
        parts.push(customNode);
        keyIndex += 1;
      } else {
        parts.push(<span key={keyIndex++}>{match[0]}</span>);
      }
    }

    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={keyIndex++}>{text.substring(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  toneStyles: MarkdownToneStyles;
}

export function CodeBlock({ code, language, toneStyles }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: '8px',
        border: `1px solid ${toneStyles.border}`,
        overflow: 'hidden',
        background: toneStyles.surface,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: toneStyles.surfaceMuted,
          borderBottom: `1px solid ${toneStyles.border}`,
          fontSize: '11px',
          color: toneStyles.textSecondary,
          fontWeight: 500,
        }}
      >
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          style={{
            background: 'transparent',
            border: 'none',
            color: toneStyles.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'background var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = toneStyles.inlineCodeBackground; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {copied ? (
            <>
              <Check size={12} style={{ color: 'var(--color-success)' }} />
              <span style={{ color: 'var(--color-success)' }}>Copied!</span>
            </>
          ) : (
            <>
              <Clipboard size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px',
          overflowX: 'auto',
          background: toneStyles.surfaceSubtle,
          fontFamily: 'var(--mono)',
          fontSize: '12px',
          lineHeight: '1.5',
          color: toneStyles.textPrimary,
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface MarkdownBlock {
  type: 'heading' | 'blockquote' | 'list' | 'code-block' | 'table' | 'paragraph' | 'break';
  level?: number;
  language?: string;
  code?: string;
  listType?: 'ul' | 'ol';
  items?: { text: string; checked?: boolean }[];
  headers?: string[];
  alignments?: ('left' | 'center' | 'right' | null)[];
  rows?: string[][];
  text?: string;
}

export function FormattedMarkdown({ text, customTokenRegex, renderCustomToken, tone = 'default' }: FormattedMarkdownProps) {
  if (!text) {
    return null;
  }

  const toneStyles = MARKDOWN_TONES[tone];

  // Parse markdown into blocks
  const parseBlocks = (): MarkdownBlock[] => {
    const lines = text.split('\n');
    const blocks: MarkdownBlock[] = [];
    let i = 0;

    const isDelimiterLine = (l: string): boolean => {
      const trimmed = l.trim();
      return /^\s*\|?\s*(:?-+:?\s*\|\s*)+(:?-+:?\s*\|?)?\s*$/.test(trimmed) && trimmed.includes('-');
    };

    const hasPipe = (l: string): boolean => l.includes('|');

    while (i < lines.length) {
      const line = lines[i];

      // 1. Code Block
      if (line.trim().startsWith('```')) {
        const language = line.trim().slice(3).trim();
        let code = '';
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          code += lines[i] + '\n';
          i++;
        }
        if (code.endsWith('\n')) {
          code = code.slice(0, -1);
        }
        blocks.push({ type: 'code-block', language, code });
        i++; // Skip closing ```
        continue;
      }

      // 2. Table Block
      if (hasPipe(line) && i + 1 < lines.length && isDelimiterLine(lines[i + 1])) {
        const headerRow = line;
        const delimiterRow = lines[i + 1];

        const parseTableRow = (rowStr: string): string[] => {
          const rawParts = rowStr.split('|').map(s => s.trim());
          let parts = [...rawParts];
          if (rowStr.trim().startsWith('|')) {
            parts.shift();
          }
          if (rowStr.trim().endsWith('|')) {
            parts.pop();
          }
          return parts;
        };

        const headers = parseTableRow(headerRow);
        const delimiterParts = parseTableRow(delimiterRow);

        const alignments = delimiterParts.map(part => {
          const left = part.startsWith(':');
          const right = part.endsWith(':');
          if (left && right) return 'center' as const;
          if (right) return 'right' as const;
          return 'left' as const;
        });

        const rows: string[][] = [];
        i += 2;

        while (i < lines.length && hasPipe(lines[i]) && !isDelimiterLine(lines[i])) {
          rows.push(parseTableRow(lines[i]));
          i++;
        }

        blocks.push({ type: 'table', headers, alignments, rows });
        continue;
      }

      // 3. Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2],
        });
        i++;
        continue;
      }

      // 4. Blockquotes
      if (line.trim().startsWith('>')) {
        let quoteText = line.trim().slice(1).trim();
        i++;
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteText += ' ' + lines[i].trim().slice(1).trim();
          i++;
        }
        blocks.push({ type: 'blockquote', text: quoteText });
        continue;
      }

      // 5. Lists (unordered, ordered, task list)
      const taskListMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
      const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
      const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);

      if (taskListMatch || unorderedMatch || orderedMatch) {
        const listType = orderedMatch ? 'ol' : 'ul';
        const items: { text: string; checked?: boolean }[] = [];

        while (i < lines.length) {
          const curLine = lines[i];
          const curTask = curLine.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
          const curUnordered = curLine.match(/^[-*]\s+(.*)$/);
          const curOrdered = curLine.match(/^(\d+)\.\s+(.*)$/);

          if (listType === 'ol' && curOrdered) {
            items.push({ text: curOrdered[2] });
          } else if (listType === 'ul' && curTask) {
            items.push({ text: curTask[2], checked: curTask[1].toLowerCase() === 'x' });
          } else if (listType === 'ul' && curUnordered) {
            items.push({ text: curUnordered[1] });
          } else {
            break;
          }
          i++;
        }

        blocks.push({ type: 'list', listType, items });
        continue;
      }

      // 6. Blank lines
      if (line.trim() === '') {
        blocks.push({ type: 'break' });
        i++;
        continue;
      }

      // 7. Paragraph
      let paraText = line.trim();
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (
          nextLine.trim() === '' ||
          nextLine.trim().startsWith('```') ||
          nextLine.match(/^(#{1,6})\s+/) ||
          nextLine.trim().startsWith('>') ||
          nextLine.match(/^[-*]\s+/) ||
          nextLine.match(/^(\d+)\.\s+/)
        ) {
          break;
        }
        paraText += '\n' + nextLine.trim();
        i++;
      }
      blocks.push({ type: 'paragraph', text: paraText });
    }

    return blocks;
  };

  const blocks = parseBlocks();

  return (
    <div className="markdown-renderer" style={{ color: toneStyles.textPrimary }}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const level = block.level || 3;
            const headingStyle: React.CSSProperties = {
              fontWeight: 600,
              marginTop: '16px',
              marginBottom: '8px',
              color: toneStyles.textPrimary,
            };
            if (level === 1) {
              return (
                <h1 key={index} style={{ ...headingStyle, fontSize: '20px' }}>
                  <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
                </h1>
              );
            }
            if (level === 2) {
              return (
                <h2 key={index} style={{ ...headingStyle, fontSize: '16px' }}>
                  <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
                </h2>
              );
            }
            return (
              <h3 key={index} style={{ ...headingStyle, fontSize: '14px' }}>
                <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
              </h3>
            );
          }
          case 'blockquote':
            return (
              <blockquote
                key={index}
                style={{
                  borderLeft: `3px solid ${toneStyles.border}`,
                  margin: '8px 0',
                  paddingLeft: '12px',
                  color: toneStyles.textSecondary,
                  fontStyle: 'italic',
                }}
              >
                <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
              </blockquote>
            );
          case 'list': {
            const ListTag = block.listType === 'ol' ? 'ol' : 'ul';
            const listStyle: React.CSSProperties = {
              margin: '8px 0',
              paddingLeft: '24px',
              listStyleType: block.listType === 'ol' ? 'decimal' : 'disc',
            };
            return (
              <ListTag key={index} style={listStyle}>
                {block.items?.map((item, itemIdx) => {
                  if (item.checked !== undefined) {
                    return (
                      <li
                        key={itemIdx}
                        style={{
                          listStyleType: 'none',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          margin: '4px 0',
                          marginLeft: '-24px',
                        }}
                      >
                        <div style={{ marginTop: '2px' }}>
                          {item.checked ? (
                            <CheckSquare size={14} color={toneStyles.accent} />
                          ) : (
                            <Square size={14} color={toneStyles.iconMuted} />
                          )}
                        </div>
                        <span style={{ textDecoration: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.7 : 1 }}>
                          <InlineFormattedText text={item.text} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={itemIdx} style={{ margin: '2px 0' }}>
                      <InlineFormattedText text={item.text} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
                    </li>
                  );
                })}
              </ListTag>
            );
          }
          case 'code-block':
            return <CodeBlock key={index} code={block.code || ''} language={block.language} toneStyles={toneStyles} />;
          case 'table':
            return (
              <div key={index} style={{ overflowX: 'auto', margin: '12px 0', borderRadius: '8px', border: `1px solid ${toneStyles.border}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: toneStyles.surfaceMuted, borderBottom: `2px solid ${toneStyles.border}` }}>
                      {block.headers?.map((header, colIdx) => (
                        <th
                          key={colIdx}
                          style={{
                            padding: '8px 12px',
                            fontWeight: 600,
                            textAlign: block.alignments?.[colIdx] || 'left',
                            color: toneStyles.textPrimary,
                          }}
                        >
                          <InlineFormattedText text={header} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows?.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        style={{
                          borderBottom: `1px solid ${toneStyles.border}`,
                          background: rowIdx % 2 === 0 ? 'transparent' : toneStyles.surfaceMuted,
                        }}
                      >
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            style={{
                              padding: '8px 12px',
                              textAlign: block.alignments?.[cellIdx] || 'left',
                              color: toneStyles.textSecondary,
                            }}
                          >
                            <InlineFormattedText text={cell} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'break':
            return <div key={index} style={{ height: '8px' }} />;
          case 'paragraph':
          default:
            return (
              <div key={index} style={{ margin: '4px 0', lineHeight: 1.5 }}>
                <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} toneStyles={toneStyles} />
              </div>
            );
        }
      })}
    </div>
  );
}
