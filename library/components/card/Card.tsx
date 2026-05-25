import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  bodyStyle?: React.CSSProperties;
}

export function Card({ title, extra, children, style, className = '', bodyStyle, ...props }: CardProps) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
      {...props}
    >
      {(title || extra) && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-default)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {title && <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h4>}
          {extra}
        </div>
      )}
      <div style={{ padding: '16px', fontSize: '13px', ...bodyStyle }}>{children}</div>
    </div>
  );
}
