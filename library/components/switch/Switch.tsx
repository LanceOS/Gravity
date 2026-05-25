import React from 'react';
import { cn } from '../../utilities';

export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ label, checked, onCheckedChange, style, className = '', ...props }: SwitchProps) {
  const switchId = React.useId();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', ...style }}>
      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
        className={cn('clickable lib-focus-ring', className)}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-surface-disabled)',
          border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-default)'}`,
          position: 'relative',
          padding: 0,
          cursor: 'pointer',
          transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
        }}
        {...props}
      >
        <span
          style={{
            display: 'block',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-surface-overlay)',
            boxShadow: 'var(--shadow-sm)',
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            transition: 'left var(--transition-normal)',
          }}
        />
      </button>
      <label htmlFor={switchId} style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
    </div>
  );
}
