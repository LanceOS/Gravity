import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning' | 'default';
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'default', style, ...props }: BadgeProps) {
  const variantStyles = {
    default: { backgroundColor: 'var(--color-base50)', color: 'var(--color-text-disabled)' },
    accent: { backgroundColor: 'var(--color-state-selected-bg)', color: 'var(--color-primary)', borderColor: 'var(--color-border-focus)' },
    success: { backgroundColor: 'var(--color-bg-success)', color: 'var(--color-text-success)', borderColor: 'var(--color-success)' },
    error: { backgroundColor: 'var(--color-bg-error)', color: 'var(--color-text-error)', borderColor: 'var(--color-border-error)' },
    warning: { backgroundColor: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', borderColor: 'var(--color-warning)' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-xs)',
        fontSize: '11px',
        fontWeight: 500,
        border: '1px solid var(--color-border-default)',
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
