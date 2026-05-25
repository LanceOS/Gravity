import React from 'react';
import type { MarkdownTextProps } from './types';

type InlineMatch =
  | { index: number; length: number; type: 'bold'; text: string }
  | { index: number; length: number; type: 'code'; text: string };

function TextInlineParser({ text }: MarkdownTextProps) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const matches: InlineMatch[] = [
      boldMatch && boldMatch.index !== undefined
        ? { index: boldMatch.index, length: boldMatch[0].length, type: 'bold', text: boldMatch[1] }
        : null,
      codeMatch && codeMatch.index !== undefined
        ? { index: codeMatch.index, length: codeMatch[0].length, type: 'code', text: codeMatch[1] }
        : null,
    ].filter((match): match is InlineMatch => match !== null);

    if (matches.length === 0) {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<span key={key}>{remaining}</span>);
      break;
    }

    matches.sort((left, right) => left.index - right.index);
    const firstMatch = matches[0];

    if (firstMatch.index > 0) {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<span key={key}>{remaining.substring(0, firstMatch.index)}</span>);
    }

    if (firstMatch.type === 'bold') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<strong key={key} style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{firstMatch.text}</strong>);
    } else {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<code key={key} style={{ background: 'var(--color-base100)', padding: '1px 3px', borderRadius: '3px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--color-primary)' }}>{firstMatch.text}</code>);
    }

    remaining = remaining.substring(firstMatch.index + firstMatch.length);
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
