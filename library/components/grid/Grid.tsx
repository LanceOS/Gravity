import React from 'react';

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  columns?: string | number;
  gap?: string;
}

export function Grid({ children, columns = 3, gap = 'var(--space-3)', style, className = '', ...props }: GridProps) {
  return (
    <div
      className={`lib-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns,
        gap,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
