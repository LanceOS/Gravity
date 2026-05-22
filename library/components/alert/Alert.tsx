import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface AlertProps {
  type?: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Alert({ type = 'info', title, children, style }: AlertProps) {
  const typeIcons = {
    success: <CheckCircle2 size={16} style={{ color: 'var(--priority-low)' }} />,
    error: <AlertCircle size={16} style={{ color: 'var(--priority-high)' }} />,
    warning: <AlertTriangle size={16} style={{ color: 'var(--priority-medium)' }} />,
    info: <Info size={16} style={{ color: 'var(--accent)' }} />,
  };

  const bgColors = {
    success: 'rgba(59, 130, 246, 0.05)',
    error: 'rgba(239, 68, 68, 0.05)',
    warning: 'rgba(245, 158, 11, 0.05)',
    info: 'var(--accent-glow)',
  };

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: bgColors[type],
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
        ...style,
      }}
    >
      <div style={{ marginTop: '2px' }}>{typeIcons[type]}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {title && <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{title}</span>}
        <div style={{ color: 'var(--text)' }}>{children}</div>
      </div>
    </div>
  );
}
