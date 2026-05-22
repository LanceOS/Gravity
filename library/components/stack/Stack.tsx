import React from 'react';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  gap?: string;
  horizontal?: boolean;
  align?: string;
  justify?: string;
}

export function Stack({ children, gap = 'var(--space-3)', horizontal = false, align, justify, style, className = '', ...props }: StackProps) {
  return (
    <div
      className={`${horizontal ? 'lib-flex-row' : 'lib-stack'} ${className}`}
      style={{
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        gap,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
