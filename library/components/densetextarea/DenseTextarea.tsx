import React, { useRef, useEffect, useImperativeHandle } from 'react';
import { cn } from '../../utilities';

export interface DenseTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  autoGrow?: boolean;
}

export const DenseTextarea = React.forwardRef<HTMLTextAreaElement, DenseTextareaProps>(
  ({ label, error, style, className, id, autoGrow, value, onChange, ...props }, ref) => {
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
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          width: '100%',
          ...style
        }}
      >
        {label && (
          <label htmlFor={inputId} className="label label--dense">
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={localRef}
          className={cn('input input--dense', autoGrow ? 'auto-grow' : '', error ? 'input--error' : undefined, className)}
          style={{
            resize: autoGrow ? 'none' : 'vertical',
            minHeight: '32px',
            overflowY: autoGrow ? 'hidden' : 'auto',
            paddingTop: '6px',
            paddingBottom: '6px',
            lineHeight: '1.4',
            height: autoGrow ? 'auto' : '32px',
            ...style
          }}
          }}
          value={value}
          onChange={handleChange}
          aria-invalid={error ? 'true' : undefined}
          aria-errormessage={error ? errorId : undefined}
          {...props}
        />
        {error && (
          <span id={errorId} className="lib-field-error-msg lib-field-error-msg--dense" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

DenseTextarea.displayName = 'DenseTextarea';
