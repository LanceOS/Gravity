import React, { type ChangeEvent, type CSSProperties, type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '../../utilities';

export interface CircularColorInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  inputClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  value: string;
}

export function CircularColorInput({
  className,
  inputClassName,
  label,
  labelClassName,
  onChange,
  value,
  disabled,
  id,
  style,
  ...props
}: CircularColorInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const { width, height, ...inputStyleRest } = (style ?? {}) as CSSProperties;

  const controlStyle: CSSProperties = {
    width: width ?? '24px',
    height: height ?? '24px',
    position: 'relative',
  };

  const inputStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    padding: 0,
    margin: 0,
    border: 0,
    opacity: 0,
    borderRadius: '50%',
    cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: 'transparent',
    ...inputStyleRest,
  };

  return (
    <div className={cn('circular-color-input', className)} style={{ display: 'grid', gap: '6px' }}>
      {label ? (
        <label htmlFor={inputId} className={cn('label', labelClassName)}>
          {label}
        </label>
      ) : null}
      <div style={controlStyle}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: value,
            border: disabled ? '2px solid var(--color-border-disabled)' : '2px solid transparent',
            boxSizing: 'border-box',
          }}
        />
        <input
          {...props}
          id={inputId}
          type="color"
          disabled={disabled}
          className={cn('circular-color-input__input', inputClassName)}
          value={value}
          onChange={onChange}
          style={inputStyle}
          aria-label={`Select color. Current: ${value}`}
        />
      </div>
    </div>
  );
}
