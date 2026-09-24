import React from 'react';

export interface TagProps {
  label: string;
  onClose?: () => void;
  style?: React.CSSProperties;
}

export function Tag({ label, onClose, style }: TagProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-base50)',
        border: '1px solid var(--border-subtle)',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        ...style,
      }}
    >
      <span>{label}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="lib-focus-ring"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--color-text-disabled)',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
