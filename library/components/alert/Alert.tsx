import React from 'react';
import { AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface AlertProps {
  type?: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Alert({ type = 'info', title, children, style }: AlertProps) {
  const typeIcons = {
    success: <CheckCircle2 size={16} style={{ color: 'var(--color-text-success)' }} />,
    error: <AlertCircle size={16} style={{ color: 'var(--color-text-error)' }} />,
    warning: <AlertTriangle size={16} style={{ color: 'var(--color-text-warning)' }} />,
    info: <Info size={16} style={{ color: 'var(--color-text-info)' }} />,
  };

  const bgColors = {
    success: 'var(--color-bg-success)',
    error: 'var(--color-bg-error)',
    warning: 'var(--color-bg-warning)',
    info: 'var(--color-bg-info)',
  };

  const borderColors = {
    success: 'var(--color-success)',
    error: 'var(--color-border-error)',
    warning: 'var(--color-warning)',
    info: 'var(--color-info)',
  };

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: bgColors[type],
        border: `1px solid ${borderColors[type]}`,
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
        ...style,
      }}
    >
      <div style={{ marginTop: '2px' }}>{typeIcons[type]}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {title && <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</span>}
        <div style={{ color: 'var(--color-text-secondary)' }}>{children}</div>
      </div>
    </div>
  );
}
