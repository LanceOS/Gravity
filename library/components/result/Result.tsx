import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { FocusTrap } from '../utilities/FocusTrap';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface ResultProps {
  status: 'success' | 'error' | 'info';
  title: string;
  subTitle?: string;
  extra?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Result({ status, title, subTitle, extra, style }: ResultProps) {
  const statusIcons = {
    success: <CheckCircle2 size={40} style={{ color: 'var(--priority-low)', marginBottom: '12px' }} />,
    error: <AlertCircle size={40} style={{ color: 'var(--priority-high)', marginBottom: '12px' }} />,
    info: <Info size={40} style={{ color: 'var(--accent)', marginBottom: '12px' }} />,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        ...style,
      }}
    >
      {statusIcons[status]}
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 6px 0' }}>{title}</h2>
      {subTitle && <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>{subTitle}</p>}
      {extra}
    </div>
  );
}
