import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmptyState({ title, description, action, style }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        textAlign: 'center',
        border: '1px dashed var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-surface-card)',
        ...style,
      }}
    >
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px 0' }}>{title}</h3>
      <p style={{ fontSize: '13px', color: 'var(--color-text-disabled)', maxWidth: '320px', margin: '0 0 16px 0' }}>
        {description}
      </p>
      {action}
    </div>
  );
}
