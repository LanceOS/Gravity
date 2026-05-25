import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

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
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-base50)',
        border: '1px solid var(--color-border-default)',
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
