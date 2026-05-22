import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface RatingProps {
  max?: number;
  value: number;
  onChange: (val: number) => void;
  label?: string;
}

export function Rating({ max = 5, value, onChange, label }: RatingProps) {
  const [hoverVal, setHoverVal] = React.useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <div className="label">{label}</div>}
      <div style={{ display: 'flex', gap: '4px' }}>
        {Array.from({ length: max }, (_, i) => {
          const starVal = i + 1;
          const isActive = hoverVal !== null ? starVal <= hoverVal : starVal <= value;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHoverVal(starVal)}
              onMouseLeave={() => setHoverVal(null)}
              onClick={() => onChange(starVal)}
              aria-label={`Rate ${starVal} out of ${max}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: isActive ? 'var(--priority-medium)' : 'var(--border)',
                transition: 'color var(--transition-fast)',
              }}
            >
              <Star size={18} fill={isActive ? 'var(--priority-medium)' : 'none'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
