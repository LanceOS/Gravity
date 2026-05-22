import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning' | 'default';
  style?: React.CSSProperties;
}

export function Badge({ children, variant = 'default', style, ...props }: BadgeProps) {
  const variantStyles = {
    default: { backgroundColor: 'var(--sidebar-bg)', color: 'var(--text-muted)' },
    accent: { backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent-border)' },
    success: { backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'var(--priority-low)', borderColor: 'rgba(59,130,246,0.18)' },
    error: { backgroundColor: 'rgba(239, 68, 68, 0.08)', color: 'var(--priority-high)', borderColor: 'rgba(239,68,68,0.18)' },
    warning: { backgroundColor: 'rgba(245, 158, 11, 0.08)', color: 'var(--priority-medium)', borderColor: 'rgba(245,158,11,0.18)' },
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
        border: '1px solid var(--border)',
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
