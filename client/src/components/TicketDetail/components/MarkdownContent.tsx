import type { MarkdownTextProps } from '../types';

type MarkdownMatch =
  | { index: number; length: number; type: 'bold'; text: string }
  | { index: number; length: number; type: 'code'; text: string }
  | { index: number; length: number; type: 'link'; text: string; url: string };

function FormattedText({ text }: MarkdownTextProps) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches: MarkdownMatch[] = [
      boldMatch && boldMatch.index !== undefined
        ? { index: boldMatch.index, length: boldMatch[0].length, type: 'bold', text: boldMatch[1] }
        : null,
      codeMatch && codeMatch.index !== undefined
        ? { index: codeMatch.index, length: codeMatch[0].length, type: 'code', text: codeMatch[1] }
        : null,
      linkMatch && linkMatch.index !== undefined
        ? { index: linkMatch.index, length: linkMatch[0].length, type: 'link', text: linkMatch[1], url: linkMatch[2] }
        : null,
    ].filter((match): match is MarkdownMatch => match !== null);

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
      parts.push(<strong key={key} style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{firstMatch.text}</strong>);
    } else if (firstMatch.type === 'code') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<code key={key} style={{ background: 'var(--sidebar-bg)', padding: '1px 4px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-heading)' }}>{firstMatch.text}</code>);
    } else {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<a key={key} href={firstMatch.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="clickable">{firstMatch.text}</a>);
    }

    remaining = remaining.substring(firstMatch.index + firstMatch.length);
  }

  return <>{parts}</>;
}

export function MarkdownContent({ text }: MarkdownTextProps) {
  if (!text) {
    return null;
  }

  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        if (line.startsWith('# ')) {
          return <h2 key={lineIndex} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-heading)', margin: '12px 0 6px' }}>{line.replace('# ', '')}</h2>;
        }

        if (line.startsWith('## ')) {
          return <h3 key={lineIndex} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '10px 0 4px' }}>{line.replace('## ', '')}</h3>;
        }

        if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
          const content = line.replace(/^\s*[*-]\s+/, '');
          return <li key={lineIndex} style={{ marginLeft: '12px', fontSize: '13px', margin: '2px 0' }}><FormattedText text={content} /></li>;
        }

        return (
          <p key={lineIndex} style={{ minHeight: '18px', margin: '4px 0' }}>
            <FormattedText text={line} />
          </p>
        );
      })}
    </>
  );
}