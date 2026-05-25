import React from 'react';
import { AlertCircle, Info, CheckCircle2 } from 'lucide-react';

export interface ResultProps {
  status: 'success' | 'error' | 'info';
  title: string;
  subTitle?: string;
  extra?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Result({ status, title, subTitle, extra, style }: ResultProps) {
  const statusIcons = {
    success: <CheckCircle2 size={40} style={{ color: 'var(--color-base400)', marginBottom: '12px' }} />,
    error: <AlertCircle size={40} style={{ color: 'var(--color-text-primary)', marginBottom: '12px' }} />,
    info: <Info size={40} style={{ color: 'var(--color-primary)', marginBottom: '12px' }} />,
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
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>{title}</h2>
      {subTitle && <p style={{ fontSize: '13px', color: 'var(--color-text-disabled)', margin: '0 0 20px 0' }}>{subTitle}</p>}
      {extra}
    </div>
  );
}
