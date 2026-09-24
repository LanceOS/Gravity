import React from 'react';
import { Clock } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface TimePickerProps {
  value?: string;
  onChange: (val: string) => void;
  label?: string;
}

export function TimePicker({ value, onChange, label }: TimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const times = Array.from({ length: 24 }, (_, h) => {
    const hour = h.toString().padStart(2, '0');
    return [`${hour}:00`, `${hour}:30`];
  }).flat();

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="select-trigger clickable"
          style={{ minHeight: '36px' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Clock size={14} className="select-trigger__icon" />
            {value || 'Pick time'}
          </span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--surface-glass-strong)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
              WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
              marginTop: '8px',
              maxHeight: '160px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {times.map((time) => (
              <div
                key={time}
                onClick={() => {
                  onChange(time);
                  setIsOpen(false);
                }}
                className="clickable"
                style={{
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: value === time ? 'var(--color-base100)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {time}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
