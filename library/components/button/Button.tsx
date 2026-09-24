import React from 'react';
import { cn } from '../../utilities';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost' | 'link' | 'accent';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  style,
  type = 'button',
  ...props
}: ButtonProps) {
  const sizePadding = {
    xs: '5px 10px',
    sm: '7px 13px',
    md: '9px 16px',
    lg: '12px 22px',
  }[size];

  const sizeFontSize = {
    xs: '11px',
    sm: '12px',
    md: '13px',
    lg: '14px',
  }[size];

  let bg = 'var(--surface-glass-strong)';
  let color = 'var(--color-text-primary)';
  let border = '1px solid var(--border-glass)';
  let hoverBg = 'var(--color-surface-card)';
  let activeBg = 'var(--color-state-hover-overlay)';

  if (variant === 'primary' || variant === 'accent') {
    bg = 'var(--color-primary)';
    color = 'var(--color-text-on-accent)';
    border = '1px solid var(--color-primary)';
    hoverBg = 'var(--color-primary-hover)';
    activeBg = 'var(--color-primary-hover)';
  } else if (variant === 'secondary') {
    bg = 'var(--color-state-selected-bg)';
    color = 'var(--color-primary)';
    border = '1px solid transparent';
    hoverBg = 'var(--color-primary-light)';
    activeBg = 'var(--color-primary-light)';
  } else if (variant === 'danger') {
    bg = 'var(--color-error)';
    color = 'var(--color-text-on-danger, var(--color-text-on-accent))';
    border = '1px solid var(--color-error)';
    hoverBg = 'var(--color-error-dark)';
    activeBg = 'var(--color-error-dark)';
  } else if (variant === 'ghost') {
    bg = 'transparent';
    color = 'var(--color-text-secondary)';
    border = '1px solid transparent';
    hoverBg = 'var(--color-state-hover-overlay)';
    activeBg = 'var(--color-state-selected-bg)';
  } else if (variant === 'link') {
    bg = 'transparent';
    color = 'var(--color-primary)';
    border = '1px solid transparent';
    hoverBg = 'transparent';
    activeBg = 'transparent';
  }

  const baseStyle: React.CSSProperties & Record<'--lib-button-bg' | '--lib-button-hover-bg' | '--lib-button-active-bg', string> = {
    '--lib-button-bg': bg,
    '--lib-button-hover-bg': hoverBg,
    '--lib-button-active-bg': activeBg,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: sizePadding,
    fontSize: sizeFontSize,
    fontWeight: 500,
    lineHeight: 1.35,
    borderRadius: 'var(--radius-sm)',
    color: color,
    border: border,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition:
      'background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast), opacity var(--transition-fast)',
    width: fullWidth ? '100%' : 'auto',
    textAlign: 'center',
    userSelect: 'none',
    boxShadow: variant === 'default' || variant === 'primary' || variant === 'accent' ? 'var(--shadow-sm)' : 'none',
    ...style,
  };

  return (
    <button
      type={type}
      style={baseStyle}
      disabled={disabled || loading}
      className={cn('lib-button clickable lib-focus-ring', variant === 'link' && 'lib-button--link', className)}
      {...props}
    >
      {loading && (
        <span
          className="lib-spinner"
          style={{
            display: 'inline-block',
            width: '1em',
            height: '1em',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
          }}
        />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
