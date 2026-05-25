import React from 'react';

export interface AffixProps {
  offsetTop?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Affix({ offsetTop = 0, children, style }: AffixProps) {
  return (
    <div
      style={{
        position: 'sticky',
        top: `${offsetTop}px`,
        zIndex: 100,
        backgroundColor: 'var(--color-surface-card)',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
