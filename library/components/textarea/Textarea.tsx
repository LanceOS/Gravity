import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';
import { cn } from '../../utilities';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', id, style, ...props }: TextareaProps) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
      {label && (
        <label htmlFor={inputId} className="label" style={{ color: 'var(--text-heading)', fontWeight: 500 }}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn('input', className)}
        style={{ minHeight: '80px', resize: 'vertical' }}
        aria-invalid={error ? 'true' : undefined}
        aria-errormessage={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <span id={errorId} className="lib-field-error-msg" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
