import React from 'react';
import { cn } from '../../utilities';

export interface DenseTextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const DenseTextInput = React.forwardRef<HTMLInputElement, DenseTextInputProps>(
  ({ label, error, style, className, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;

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
        <input
          id={inputId}
          ref={ref}
          className={cn('input input--dense', error ? 'input--error' : undefined)}
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
