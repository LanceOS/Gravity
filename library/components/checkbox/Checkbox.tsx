import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Checkbox({ label, error, className = '', style, ...props }: CheckboxProps) {
  const checkboxId = React.useId();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <label
        htmlFor={checkboxId}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
        }}
      >
        <input
          type="checkbox"
          id={checkboxId}
          className={className}
          style={{
            cursor: 'pointer',
            accentColor: 'var(--color-primary)',
            width: '15px',
            height: '15px',
          }}
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && <span className="lib-field-error-msg">{error}</span>}
    </div>
  );
}
