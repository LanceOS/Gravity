import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

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
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--card-bg)',
        ...style,
      }}
    >
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px 0' }}>{title}</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px', margin: '0 0 16px 0' }}>
        {description}
      </p>
      {action}
    </div>
  );
}
