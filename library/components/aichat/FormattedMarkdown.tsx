import React from 'react';
import type { MarkdownTextProps } from './types';

function TextInlineParser({ text }: MarkdownTextProps) {
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;
  let lastIndex = 0;

  const combinedRegex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  const matches = Array.from(text.matchAll(combinedRegex));

  for (const match of matches) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(<span key={keyIndex++}>{text.substring(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      parts.push(<strong key={keyIndex++} style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(<code key={keyIndex++} style={{ background: 'var(--color-base100)', padding: '1px 3px', borderRadius: '3px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--color-primary)' }}>{match[2]}</code>);
    }

    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={keyIndex++}>{text.substring(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

export function FormattedMarkdown({ text }: MarkdownTextProps) {
  if (!text) {
    return null;
  }

  const paragraphs = text.split('\n\n');
  return (
    <>
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraph.split('\n');
        return (
          <div key={paragraphIndex} style={{ marginBottom: paragraphIndex < paragraphs.length - 1 ? '10px' : 0 }}>
            {lines.map((line, lineIndex) => {
              if (line.startsWith('* ') || line.startsWith('- ')) {
                return (
                  <li key={lineIndex} style={{ marginLeft: '12px', listStyleType: 'disc', margin: '2px 0' }}>
                    <TextInlineParser text={line.replace(/^[*-]\s+/, '')} />
                  </li>
                );
              }

              if (/^\d+\.\s+/.test(line)) {
                return (
                  <li key={lineIndex} style={{ marginLeft: '12px', listStyleType: 'decimal', margin: '2px 0' }}>
                    <TextInlineParser text={line.replace(/^\d+\.\s+/, '')} />
                  </li>
                );
              }

              return (
                <div key={lineIndex}>
                  <TextInlineParser text={line} />
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
