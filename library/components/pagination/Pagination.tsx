import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface PaginationProps {
  current: number;
  total: number;
  onChange: (page: number) => void;
  style?: React.CSSProperties;
}

export function Pagination({ current, total, onChange, style }: PaginationProps) {
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', ...style }}>
      <button
        type="button"
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        className="btn btn-sm clickable"
      >
        Prev
      </button>
      {Array.from({ length: total }, (_, i) => {
        const page = i + 1;
        const isCurrent = page === current;
        return (
          <button
            key={page}
            type="button"
            onClick={() => onChange(page)}
            className="btn btn-sm clickable"
            style={{
              minWidth: '32px',
              backgroundColor: isCurrent ? 'var(--accent-solid)' : 'var(--card-bg)',
              color: isCurrent ? '#ffffff' : 'var(--text-heading)',
              borderColor: isCurrent ? 'var(--accent-solid)' : 'var(--border)',
            }}
          >
            {page}
          </button>
        );
      })}
      <button
        type="button"
        disabled={current === total}
        onClick={() => onChange(current + 1)}
        className="btn btn-sm clickable"
      >
        Next
      </button>
    </div>
  );
}
