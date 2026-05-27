import React, { useMemo } from 'react';
import { CheckSquare, Square } from 'lucide-react';

export interface FormattedMarkdownProps {
  text: string;
  customTokenRegex?: RegExp;
  renderCustomToken?: (match: RegExpMatchArray, key: number) => React.ReactNode | null;
}

function isSafeUrl(url: string) {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return false;
  }

  if (trimmedUrl.startsWith('#') || trimmedUrl.startsWith('/') || trimmedUrl.startsWith('?')) {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedUrl, 'https://gravity.invalid');
    const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedUrl);

    if (!hasExplicitProtocol) {
      return true;
    }

    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function InlineFormattedText({ text, customTokenRegex, renderCustomToken }: FormattedMarkdownProps) {
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;
  let lastIndex = 0;

  const combinedRegex = useMemo(() => {
    let pattern = '\\*\\*([^*]+)\\*\\*|`([^`]+)`|\\[([^\\]]+)\\]\\(([^)]+)\\)';

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
          {match[2]}
        </code>,
      );
    } else if (match[3] && match[4]) {
      const safeHref = isSafeUrl(match[4]) ? match[4] : 'about:blank';
      parts.push(
        <a
          key={keyIndex++}
          href={safeHref}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
          className="clickable"
        >
          {match[3]}
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

export function FormattedMarkdown({ text, customTokenRegex, renderCustomToken }: FormattedMarkdownProps) {
  if (!text) {
    return null;
  }

  const elements: React.ReactNode[] = [];
  const listItems: React.ReactNode[] = [];
  const lines = text.split('\n');
  let activeListType: 'ul' | 'ol' | null = null;

  const flushList = (keySuffix: string | number) => {
    if (!activeListType || listItems.length === 0) {
      return;
    }

    elements.push(
      activeListType === 'ul' ? (
        <ul key={`ul-${keySuffix}`} style={{ margin: '8px 0', paddingLeft: '24px', listStyleType: 'disc' }}>
          {listItems.splice(0, listItems.length)}
        </ul>
      ) : (
        <ol key={`ol-${keySuffix}`} style={{ margin: '8px 0', paddingLeft: '24px', listStyleType: 'decimal' }}>
          {listItems.splice(0, listItems.length)}
        </ol>
      ),
    );

    activeListType = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingThreeMatch = line.match(/^###\s+(.*)$/);
    const headingTwoMatch = line.match(/^##\s+(.*)$/);
    const blockquoteMatch = line.match(/^>\s+(.*)$/);
    const taskListMatch = line.match(/^[-*] \[([ x])\]\s+(.*)$/i);
    const unorderedListMatch = line.match(/^[-*]\s+(.*)$/);
    const orderedListMatch = line.match(/^(\d+)\.\s+(.*)$/);
    const isListLine = Boolean(taskListMatch || unorderedListMatch || orderedListMatch);

    if (activeListType && !isListLine) {
      flushList(index);
    }

    if (headingThreeMatch) {
      elements.push(
        <h3
          key={index}
          style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '8px', color: 'var(--color-text-primary)' }}
        >
          <InlineFormattedText
            text={headingThreeMatch[1]}
            customTokenRegex={customTokenRegex}
            renderCustomToken={renderCustomToken}
          />
        </h3>,
      );
      continue;
    }

    if (headingTwoMatch) {
      elements.push(
        <h2
          key={index}
          style={{ fontSize: '16px', fontWeight: 600, marginTop: '16px', marginBottom: '8px', color: 'var(--color-text-primary)' }}
        >
          <InlineFormattedText
            text={headingTwoMatch[1]}
            customTokenRegex={customTokenRegex}
            renderCustomToken={renderCustomToken}
          />
        </h2>,
      );
      continue;
    }

    if (blockquoteMatch) {
      elements.push(
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
          <InlineFormattedText
            text={blockquoteMatch[1]}
            customTokenRegex={customTokenRegex}
            renderCustomToken={renderCustomToken}
          />
        </blockquote>,
      );
      continue;
    }

    if (taskListMatch) {
      activeListType = 'ul';
      const isChecked = taskListMatch[1].toLowerCase() === 'x';

      listItems.push(
        <li
          key={index}
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
            {isChecked ? (
              <CheckSquare size={14} color="var(--color-primary)" />
            ) : (
              <Square size={14} color="var(--color-text-disabled)" />
            )}
          </div>
          <span style={{ textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.7 : 1 }}>
            <InlineFormattedText
              text={taskListMatch[2]}
              customTokenRegex={customTokenRegex}
              renderCustomToken={renderCustomToken}
            />
          </span>
        </li>,
      );
      continue;
    }

    if (unorderedListMatch) {
      activeListType = 'ul';
      listItems.push(
        <li key={index} style={{ margin: '2px 0' }}>
          <InlineFormattedText
            text={unorderedListMatch[1]}
            customTokenRegex={customTokenRegex}
            renderCustomToken={renderCustomToken}
          />
        </li>,
      );
      continue;
    }

    if (orderedListMatch) {
      activeListType = 'ol';
      listItems.push(
        <li key={index} style={{ margin: '2px 0' }}>
          <InlineFormattedText
            text={orderedListMatch[2]}
            customTokenRegex={customTokenRegex}
            renderCustomToken={renderCustomToken}
          />
        </li>,
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={`br-${index}`} style={{ height: '8px' }} />);
      continue;
    }

    elements.push(
      <div key={index} style={{ margin: '4px 0', lineHeight: 1.5 }}>
        <InlineFormattedText
          text={line}
          customTokenRegex={customTokenRegex}
          renderCustomToken={renderCustomToken}
        />
      </div>,
    );
  }

  flushList('end');

  return (
    <div className="markdown-renderer" style={{ color: 'var(--color-text-primary)' }}>
      {elements}
    </div>
  );
}