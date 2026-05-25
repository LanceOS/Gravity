import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface TransferListProps {
  leftItems: string[];
  rightItems: string[];
  onChange: (left: string[], right: string[]) => void;
  label?: string;
}

export function TransferList({ leftItems, rightItems, onChange, label }: TransferListProps) {
  const [selectedLeft, setSelectedLeft] = React.useState<Record<string, boolean>>({});
  const [selectedRight, setSelectedRight] = React.useState<Record<string, boolean>>({});

  const transferToRight = () => {
    const toMove = leftItems.filter((item) => selectedLeft[item]);
    const nextLeft = leftItems.filter((item) => !selectedLeft[item]);
    onChange(nextLeft, [...rightItems, ...toMove]);
    setSelectedLeft({});
  };

  const transferToLeft = () => {
    const toMove = rightItems.filter((item) => selectedRight[item]);
    const nextRight = rightItems.filter((item) => !selectedRight[item]);
    onChange([...leftItems, ...toMove], nextRight);
    setSelectedRight({});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {label && <div className="label">{label}</div>}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {/* Left List */}
        <div
          style={{
            flex: 1,
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            height: '160px',
            overflowY: 'auto',
            padding: '6px',
            backgroundColor: 'var(--color-surface-card)',
          }}
        >
          {leftItems.map((item) => (
            <label
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!!selectedLeft[item]}
                onChange={(e) => setSelectedLeft({ ...selectedLeft, [item]: e.target.checked })}
              />
              {item}
            </label>
          ))}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button type="button" onClick={transferToRight} className="btn btn-sm clickable" style={{ minWidth: '40px' }}>
            &gt;
          </button>
          <button type="button" onClick={transferToLeft} className="btn btn-sm clickable" style={{ minWidth: '40px' }}>
            &lt;
          </button>
        </div>

        {/* Right List */}
        <div
          style={{
            flex: 1,
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            height: '160px',
            overflowY: 'auto',
            padding: '6px',
            backgroundColor: 'var(--color-surface-card)',
          }}
        >
          {rightItems.map((item) => (
            <label
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!!selectedRight[item]}
                onChange={(e) => setSelectedRight({ ...selectedRight, [item]: e.target.checked })}
              />
              {item}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
