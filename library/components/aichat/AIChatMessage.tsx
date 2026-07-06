import React from 'react';
import type { AIChatMessage } from './types';
import { FormattedMarkdown } from './FormattedMarkdown';

export interface AIChatMessageBubbleProps {
  message: AIChatMessage;
}

export function AIChatMessageBubble({ message: m }: AIChatMessageBubbleProps) {
  if (m.role === 'tool') {
    return null;
  }

  if (m.role === 'assistant' && m.tool_calls && !m.content) {
    return null;
  }

  const isUser = m.role === 'user';
  const isSystem = m.role === 'system';
  const markdownTone = isUser ? 'accent' : isSystem ? 'danger' : 'default';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        /* Ensure long continuous text wraps inside the bubble */
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        wordWrap: 'break-word',
        wordBreak: 'break-word',
        background: isUser
          ? 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 85%, #000) 100%)'
          : isSystem
          ? 'var(--color-bg-error)'
          : 'var(--color-surface-card)',
        border: `1px solid ${
          isUser
            ? 'transparent'
            : isSystem
            ? 'var(--color-border-error)'
            : 'var(--color-border-default)'
        }`,
        borderRadius: isUser ? '16px 16px 4px 16px' : isSystem ? '12px' : '16px 16px 16px 4px',
        padding: '12px 16px',
        fontSize: '12.5px',
        lineHeight: '1.6',
        color: isUser
          ? 'var(--color-text-on-accent)'
          : isSystem
          ? 'var(--color-text-error)'
          : 'var(--color-text-primary)',
        boxShadow: isUser
          ? '0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent)'
          : 'var(--shadow-sm)',
        transition: 'all var(--transition-fast)',
      }}
    >
      {m.content && <FormattedMarkdown text={m.content} tone={markdownTone} />}
    </div>
  );
}
