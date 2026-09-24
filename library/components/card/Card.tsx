import React from 'react';
import './Card.css';

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
      className={`card ${className}`.trim()}
      style={style}
      {...props}
    >
      {(title || extra) && (
        <div
          style={{
            padding: '18px 20px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {title && <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h4>}
          {extra}
        </div>
      )}
      <div style={{ padding: '20px', fontSize: '13px', ...bodyStyle }}>{children}</div>
    </div>
  );
}
