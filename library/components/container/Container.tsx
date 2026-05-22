import React from 'react';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  fluid?: boolean;
}

export function Container({ children, fluid = false, style, className = '', ...props }: ContainerProps) {
  return (
    <div
      className={`lib-container ${className}`}
      style={{
        width: '100%',
        maxWidth: fluid ? '100%' : '1200px',
        marginRight: 'auto',
        marginLeft: 'auto',
        paddingLeft: 'var(--space-4)',
        paddingRight: 'var(--space-4)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
