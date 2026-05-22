import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';
import { cn } from '../../utilities';

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
    xs: '4px 8px',
    sm: '6px 12px',
    md: '8px 16px',
    lg: '10px 20px',
  }[size];

  const sizeFontSize = {
    xs: '11px',
    sm: '12px',
    md: '13px',
    lg: '14px',
  }[size];

  let bg = 'var(--card-bg)';
  let color = 'var(--text)';
  let border = '1px solid var(--border)';
  let hoverBg = 'var(--card-hover)';
  let activeBg = 'var(--border)';

  if (variant === 'primary' || variant === 'accent') {
    bg = 'var(--accent-solid)';
    color = 'var(--accent-foreground)';
    border = '1px solid var(--accent-solid)';
    hoverBg = 'var(--accent-solid-hover)';
    activeBg = 'var(--accent-solid-hover)';
  } else if (variant === 'secondary') {
    bg = 'var(--accent-glow)';
    color = 'var(--accent)';
    border = '1px solid var(--accent-border)';
    hoverBg = 'rgba(170, 59, 255, 0.2)';
    activeBg = 'rgba(170, 59, 255, 0.25)';
  } else if (variant === 'danger') {
    bg = 'var(--danger)';
    color = 'var(--danger-foreground)';
    border = '1px solid var(--danger)';
    hoverBg = 'var(--danger-hover)';
    activeBg = 'var(--danger-hover)';
  } else if (variant === 'ghost') {
    bg = 'transparent';
    color = 'var(--text)';
    border = '1px solid transparent';
    hoverBg = 'var(--card-hover)';
    activeBg = 'var(--border)';
  } else if (variant === 'link') {
    bg = 'transparent';
    color = 'var(--accent)';
    border = '1px solid transparent';
    hoverBg = 'transparent';
    activeBg = 'transparent';
  }

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: sizePadding,
    fontSize: sizeFontSize,
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    backgroundColor: bg,
    color: color,
    border: border,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all var(--transition-normal)',
    width: fullWidth ? '100%' : 'auto',
    textAlign: 'center',
    userSelect: 'none',
    boxShadow: variant === 'link' || variant === 'ghost' ? 'none' : 'var(--shadow-sm)',
    ...style,
  };

  const [isHovered, setIsHovered] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  const currentBg = isActive ? activeBg : isHovered ? hoverBg : bg;
  const currentStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: variant === 'link' ? 'transparent' : currentBg,
    textDecoration: variant === 'link' && isHovered ? 'underline' : 'none',
  };

  return (
    <button
      type={type}
      style={currentStyle}
      disabled={disabled || loading}
      onMouseEnter={() => !disabled && !loading && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsActive(false);
      }}
      onMouseDown={() => !disabled && !loading && setIsActive(true)}
      onMouseUp={() => !disabled && !loading && setIsActive(false)}
      className={cn('clickable lib-focus-ring', className)}
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
