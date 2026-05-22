import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface DenseTextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const DenseTextInput = React.forwardRef<HTMLInputElement, DenseTextInputProps>(
  ({ label, error, style, id, ...props }, ref) => {
    const inputId = id || `dense-input-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          width: '100%'
        }}
      >
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              userSelect: 'none'
            }}
          >
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          <input
            id={inputId}
            ref={ref}
            style={{
              width: '100%',
              backgroundColor: 'var(--card-bg)',
              border: `1px solid ${error ? 'var(--priority-high)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-xs)',
              paddingTop: 'var(--input-padding-y, 2px)',
              paddingBottom: 'var(--input-padding-y, 2px)',
              paddingLeft: 'var(--space-2, 8px)',
              paddingRight: 'var(--space-2, 8px)',
              fontFamily: 'var(--sans)',
              fontSize: '12px',
              color: 'var(--text-heading)',
              outline: 'none',
              transition: 'border-color var(--transition-fast, 0.1s ease), box-shadow var(--transition-fast, 0.1s ease)',
              ...style
            }}
            className="dense-input-element"
            {...props}
          />
        </div>
        {error && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--priority-high)',
              fontWeight: 500
            }}
          >
            {error}
          </span>
        )}

        {/* Dynamic focus and validation stylings loaded securely at compile-time */}
        <style dangerouslySetInnerHTML={{
          __html: `
          .dense-input-element:focus {
            border-color: var(--accent) !important;
            box-shadow: 0 0 0 2px var(--accent-glow) !important;
          }
          .dense-input-element:disabled {
            background-color: var(--sidebar-bg) !important;
            color: var(--text-muted) !important;
            cursor: not-allowed;
            opacity: 0.6;
          }
          .dense-input-element:-webkit-autofill,
          .dense-input-element:-webkit-autofill:hover, 
          .dense-input-element:-webkit-autofill:focus {
            -webkit-text-fill-color: var(--text-heading) !important;
            -webkit-box-shadow: 0 0 0px 1000px var(--card-bg) inset !important;
            transition: background-color 5000s ease-in-out 0s;
          }
        `}} />
      </div>
    );
  }
);
