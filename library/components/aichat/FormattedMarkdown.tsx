import React, { useMemo, useState } from 'react';
import { CheckSquare, Square, Clipboard, Check } from 'lucide-react';
import { isSafeHref } from '../../utilities/sanitizeHtml';

export interface FormattedMarkdownProps {
  text: string;
  customTokenRegex?: RegExp;
  renderCustomToken?: (match: RegExpMatchArray, key: number) => React.ReactNode | null;
}

function InlineFormattedText({ text, customTokenRegex, renderCustomToken }: FormattedMarkdownProps) {
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
        <strong key={keyIndex++} style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
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
            background: 'var(--color-base100)',
            padding: '2px 4px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'var(--mono)',
            color: 'var(--color-primary)',
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
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
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
}

export function CodeBlock({ code, language }: CodeBlockProps) {
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
        border: '1px solid var(--color-border-default)',
        overflow: 'hidden',
        background: 'var(--color-surface-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'var(--color-surface-app)',
          borderBottom: '1px solid var(--color-border-default)',
          fontSize: '11px',
          color: 'var(--color-text-secondary)',
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
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'background var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
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
          background: 'var(--color-base50)',
          fontFamily: 'var(--mono)',
          fontSize: '12px',
          lineHeight: '1.5',
          color: 'var(--color-text-primary)',
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

export function FormattedMarkdown({ text, customTokenRegex, renderCustomToken }: FormattedMarkdownProps) {
  if (!text) {
    return null;
  }

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
    <div className="markdown-renderer" style={{ color: 'var(--color-text-primary)' }}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const level = block.level || 3;
            const headingStyle: React.CSSProperties = {
              fontWeight: 600,
              marginTop: '16px',
              marginBottom: '8px',
              color: 'var(--color-text-primary)',
            };
            if (level === 1) {
              return (
                <h1 key={index} style={{ ...headingStyle, fontSize: '20px' }}>
                  <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
                </h1>
              );
            }
            if (level === 2) {
              return (
                <h2 key={index} style={{ ...headingStyle, fontSize: '16px' }}>
                  <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
                </h2>
              );
            }
            return (
              <h3 key={index} style={{ ...headingStyle, fontSize: '14px' }}>
                <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
              </h3>
            );
          }
          case 'blockquote':
            return (
              <blockquote
                key={index}
                style={{
                  borderLeft: '3px solid var(--color-border-default)',
                  margin: '8px 0',
                  paddingLeft: '12px',
                  color: 'var(--color-text-secondary)',
                  fontStyle: 'italic',
                }}
              >
                <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
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
                            <CheckSquare size={14} color="var(--color-primary)" />
                          ) : (
                            <Square size={14} color="var(--color-text-disabled)" />
                          )}
                        </div>
                        <span style={{ textDecoration: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.7 : 1 }}>
                          <InlineFormattedText text={item.text} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={itemIdx} style={{ margin: '2px 0' }}>
                      <InlineFormattedText text={item.text} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
                    </li>
                  );
                })}
              </ListTag>
            );
          }
          case 'code-block':
            return <CodeBlock key={index} code={block.code || ''} language={block.language} />;
          case 'table':
            return (
              <div key={index} style={{ overflowX: 'auto', margin: '12px 0', borderRadius: '8px', border: '1px solid var(--color-border-default)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-app)', borderBottom: '2px solid var(--color-border-default)' }}>
                      {block.headers?.map((header, colIdx) => (
                        <th
                          key={colIdx}
                          style={{
                            padding: '8px 12px',
                            fontWeight: 600,
                            textAlign: block.alignments?.[colIdx] || 'left',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          <InlineFormattedText text={header} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows?.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        style={{
                          borderBottom: '1px solid var(--color-border-default)',
                          background: rowIdx % 2 === 0 ? 'transparent' : 'var(--color-surface-app)',
                        }}
                      >
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            style={{
                              padding: '8px 12px',
                              textAlign: block.alignments?.[cellIdx] || 'left',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            <InlineFormattedText text={cell} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
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
                <InlineFormattedText text={block.text || ''} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
              </div>
            );
        }
      })}
    </div>
  );
}