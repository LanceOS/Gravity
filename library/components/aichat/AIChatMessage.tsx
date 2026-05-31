import React from 'react';
import { Cpu, Sparkles } from 'lucide-react';
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
          /* Ensure long continuous text wraps inside the bubble */
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordWrap: 'break-word',
          wordBreak: 'break-word',
        background:
          m.role === 'user'
            ? 'var(--color-base100)'
            : m.role === 'system'
            ? 'var(--color-error-light)'
            : 'var(--color-surface-card)',
        border: `1px solid ${
          m.role === 'user'
            ? 'var(--color-border-focus)'
            : m.role === 'system'
            ? 'var(--color-error-dark)'
            : 'var(--color-border-default)'
        }`,
        borderRadius: '8px',
        padding: '10px 12px',
        fontSize: '12px',
        lineHeight: '1.5',
        color:
          m.role === 'user'
            ? 'var(--color-text-primary)'
            : m.role === 'system'
            ? 'var(--color-error-dark)'
            : 'var(--color-text-secondary)',
      }}
    >
      {m.content && <FormattedMarkdown text={m.content} />}
    </div>
  );
}
