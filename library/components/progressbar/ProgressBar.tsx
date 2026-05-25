import React from 'react';

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  style?: React.CSSProperties;
}

export function ProgressBar({ value, max = 100, label, style }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-disabled)' }}>
          <span>{label}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}
      <progress
        value={value}
        max={max}
        style={{
          width: '100%',
          height: '6px',
          appearance: 'none',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          backgroundColor: 'var(--color-border-default)',
          border: 'none',
        }}
      />
    </div>
  );
}
