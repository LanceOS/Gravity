import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { CheckSquare, Square } from 'lucide-react';

export interface MarkdownRendererProps {
  text: string;
  customTokenRegex?: RegExp;
  renderCustomToken?: (match: RegExpMatchArray, keyIndex: number) => React.ReactNode;
}

function InlineParser({ text, customTokenRegex, renderCustomToken }: MarkdownRendererProps) {
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;
  let lastIndex = 0;

  const combinedRegex = useMemo(() => {
    let source = `\\*\\*([^*]+)\\*\\*|\`([^\`]+)\`|\\[([^\\]]+)\\]\\(([^)]+)\\)`;
    if (customTokenRegex) {
      source += `|${customTokenRegex.source}`;
    }
    return new RegExp(source, 'gi');
  }, [customTokenRegex]);

  const isSafeUrl = (url: string) => {
    return DOMPurify.isValidAttribute('a', 'href', url);
  };

  const matches = Array.from(text.matchAll(combinedRegex));

  for (const match of matches) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(<span key={keyIndex++}>{text.substring(lastIndex, match.index)}</span>);
    }

    if (match[1]) { // Bold
      parts.push(<strong key={keyIndex++} style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{match[1]}</strong>);
    } else if (match[2]) { // Code
      parts.push(<code key={keyIndex++} style={{ background: 'var(--color-base100)', padding: '2px 4px', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--mono)', color: 'var(--color-primary)' }}>{match[2]}</code>);
    } else if (match[3] && match[4]) { // Link
      const safeHref = isSafeUrl(match[4]) ? match[4] : 'about:blank';
      parts.push(<a key={keyIndex++} href={safeHref} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none' }} className="clickable">{match[3]}</a>);
    } else if (renderCustomToken) {
      const customNode = renderCustomToken(match, keyIndex);
      if (customNode) {
        parts.push(customNode);
        keyIndex++;
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

export function MarkdownRenderer({ text, customTokenRegex, renderCustomToken }: MarkdownRendererProps) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];

  let currentList: React.ReactNode[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const h2Match = line.match(/^##\s+(.*)/);
    const h3Match = line.match(/^###\s+(.*)/);
    const bqMatch = line.match(/^>\s+(.*)/);
    const taskMatch = line.match(/^- \[([ x])\]\s+(.*)/i);
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);

    const isAnyList = taskMatch || ulMatch || olMatch;
    if (inList && !isAnyList) {
      blocks.push(
        listType === 'ul' ? (
          <ul key={`ul-${i}`} style={{ margin: '8px 0', paddingLeft: '24px', listStyleType: 'disc' }}>{currentList}</ul>
        ) : (
          <ol key={`ol-${i}`} style={{ margin: '8px 0', paddingLeft: '24px', listStyleType: 'decimal' }}>{currentList}</ol>
        )
      );
      currentList = [];
      inList = false;
    }

    if (h3Match) {
      blocks.push(<h3 key={i} style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '8px', color: 'var(--color-text-primary)' }}><InlineParser text={h3Match[1]} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} /></h3>);
      continue;
    }

    if (h2Match) {
      blocks.push(<h2 key={i} style={{ fontSize: '16px', fontWeight: 600, marginTop: '16px', marginBottom: '8px', color: 'var(--color-text-primary)' }}><InlineParser text={h2Match[1]} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} /></h2>);
      continue;
    }

    if (bqMatch) {
      blocks.push(
        <blockquote key={i} style={{ borderLeft: '3px solid var(--color-border-default)', margin: '8px 0', paddingLeft: '12px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          <InlineParser text={bqMatch[1]} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
        </blockquote>
      );
      continue;
    }

    if (taskMatch) {
      inList = true;
      listType = 'ul';
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      currentList.push(
        <li key={i} style={{ listStyleType: 'none', display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0', marginLeft: '-24px' }}>
          <div style={{ marginTop: '2px' }}>
            {isChecked ? <CheckSquare size={14} color="var(--color-primary)" /> : <Square size={14} color="var(--color-text-disabled)" />}
          </div>
          <span style={{ textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.7 : 1 }}>
            <InlineParser text={taskMatch[2]} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
          </span>
        </li>
      );
      continue;
    }

    if (ulMatch) {
      inList = true;
      listType = 'ul';
      currentList.push(
        <li key={i} style={{ margin: '2px 0' }}>
          <InlineParser text={ulMatch[1]} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
        </li>
      );
      continue;
    }

    if (olMatch) {
      inList = true;
      listType = 'ol';
      currentList.push(
        <li key={i} style={{ margin: '2px 0' }}>
          <InlineParser text={olMatch[2]} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
        </li>
      );
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={`br-${i}`} style={{ height: '8px' }} />);
    } else {
      blocks.push(
        <div key={i} style={{ margin: '4px 0', lineHeight: 1.5 }}>
          <InlineParser text={line} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />
        </div>
      );
    }
  }

  if (inList && currentList.length > 0) {
    blocks.push(
      listType === 'ul' ? (
        <ul key={`ul-end`} style={{ margin: '8px 0', paddingLeft: '24px', listStyleType: 'disc' }}>{currentList}</ul>
      ) : (
        <ol key={`ol-end`} style={{ margin: '8px 0', paddingLeft: '24px', listStyleType: 'decimal' }}>{currentList}</ol>
      )
    );
  }

  return (
    <div className="markdown-renderer" style={{ color: 'var(--color-text-primary)' }}>
      {blocks}
    </div>
  );
}
