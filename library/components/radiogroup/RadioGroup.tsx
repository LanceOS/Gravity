import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface RadioGroupProps {
  label: string;
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (val: string) => void;
  style?: React.CSSProperties;
}

export function RadioGroup({ label, name, options, value, onChange, style }: RadioGroupProps) {
  return (
    <fieldset
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        ...style,
      }}
    >
      <legend className="label" style={{ padding: 0, marginBottom: '4px', color: 'var(--text-heading)' }}>
        {label}
      </legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {options.map((opt) => {
          const optId = `${name}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={optId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text)',
              }}
            >
              <input
                type="radio"
                id={optId}
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange?.(opt.value)}
                style={{ accentColor: 'var(--accent-solid)' }}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
