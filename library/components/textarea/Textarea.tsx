import React, { useRef, useEffect, useImperativeHandle } from 'react';
import { cn } from '../../utilities';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  autoGrow?: boolean;
  inputStyle?: React.CSSProperties;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, style, inputStyle, autoGrow, value, onChange, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    
    const localRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => localRef.current!);

    useEffect(() => {
      if (autoGrow && localRef.current) {
        const textarea = localRef.current;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    }, [autoGrow, value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onChange) {
        onChange(e);
      }
      if (autoGrow && localRef.current) {
        const textarea = localRef.current;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
        {label && (
          <label htmlFor={inputId} className="label" style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={localRef}
          className={cn('input', autoGrow ? 'auto-grow' : '', className)}
          style={{
            minHeight: autoGrow ? undefined : '80px',
            resize: autoGrow ? 'none' : 'vertical',
            overflowY: autoGrow ? 'hidden' : 'auto',
            ...inputStyle
          }}
          value={value}
          onChange={handleChange}
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
);

Textarea.displayName = 'Textarea';
