import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning' | 'default';
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'default', style, ...props }: BadgeProps) {
  const variantStyles = {
    default: { backgroundColor: 'var(--color-base100)', color: 'var(--color-text-secondary)' },
    accent: { backgroundColor: 'var(--color-state-selected-bg)', color: 'var(--color-primary)' },
    success: { backgroundColor: 'var(--color-bg-success)', color: 'var(--color-text-success)' },
    error: { backgroundColor: 'var(--color-bg-error)', color: 'var(--color-text-error)' },
    warning: { backgroundColor: 'var(--color-bg-warning)', color: 'var(--color-text-warning)' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        fontSize: '11px',
        fontWeight: 500,
        border: '1px solid transparent',
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
