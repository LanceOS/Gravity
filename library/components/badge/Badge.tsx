import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning' | 'default';
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'default', style, ...props }: BadgeProps) {
  const variantStyles = {
    default: { backgroundColor: 'var(--color-base50)', color: 'var(--color-text-disabled)' },
    accent: { backgroundColor: 'var(--color-state-selected-bg)', color: 'var(--color-primary)', borderColor: 'var(--color-border-focus)' },
    success: { backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'var(--color-base400)', borderColor: 'rgba(59,130,246,0.18)' },
    error: { backgroundColor: 'rgba(239, 68, 68, 0.08)', color: 'var(--color-text-primary)', borderColor: 'rgba(239,68,68,0.18)' },
    warning: { backgroundColor: 'rgba(245, 158, 11, 0.08)', color: 'var(--color-text-secondary)', borderColor: 'rgba(245,158,11,0.18)' },
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
