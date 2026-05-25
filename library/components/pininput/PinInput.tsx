import React from 'react';

export interface PinInputProps {
  length?: number;
  value: string;
  onChange: (val: string) => void;
  label?: string;
}

export function PinInput({ length = 4, value, onChange, label }: PinInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (val: string, index: number) => {
    const cleanVal = val.slice(-1);
    const nextArr = value.split('');
    nextArr[index] = cleanVal;
    const nextStr = nextArr.join('');
    onChange(nextStr);

    if (cleanVal && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label className="label">{label}</label>}
      <div style={{ display: 'flex', gap: '8px' }}>
        {Array.from({ length }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            className="input input--pin"
            value={value[i] || ''}
            onChange={(e) => handleChange(e.target.value, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            style={{
              height: '40px',
            }}
          />
        ))}
      </div>
    </div>
  );
}
