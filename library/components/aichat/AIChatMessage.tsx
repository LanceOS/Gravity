import React from 'react';
import { Cpu, Sparkles } from 'lucide-react';
import type { AIChatMessage } from './types';
import { FormattedMarkdown } from './FormattedMarkdown';

export interface AIChatMessageBubbleProps {
  message: AIChatMessage;
}

export function AIChatMessageBubble({ message: m }: AIChatMessageBubbleProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background:
          m.role === 'user'
            ? 'var(--color-base100)'
            : m.role === 'system'
            ? 'var(--color-error-light)'
            : m.role === 'tool'
            ? 'var(--color-base50)'
            : 'var(--color-surface-card)',
        border: `1px solid ${
          m.role === 'user'
            ? 'var(--color-border-focus)'
            : m.role === 'system'
            ? 'var(--color-error-dark)'
            : m.role === 'tool'
            ? 'var(--color-border-default)'
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
        opacity: m.role === 'tool' ? 0.7 : 1,
      }}
    >
      {m.role === 'tool' && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--color-text-disabled)',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Cpu size={10} /> Tool Execution: {m.name}
        </div>
      )}
      {m.content && <FormattedMarkdown text={m.content} />}
      {m.tool_calls &&
        m.tool_calls.map((tc, tcIdx) => (
          <div
            key={tcIdx}
            style={{
              marginTop: m.content ? '8px' : '0',
              padding: '6px',
              background: 'var(--color-base50)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--color-text-disabled)',
              border: '1px dashed var(--color-border-default)',
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={10} /> Calling tool: {tc.name}
            </div>
            <div style={{ fontFamily: 'var(--mono)', marginTop: '4px', opacity: 0.8 }}>
              {typeof tc.arguments === 'string'
                ? tc.arguments
                : JSON.stringify(tc.arguments, null, 2)}
            </div>
          </div>
        ))}
    </div>
  );
}
