import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (val: [number, number]) => void;
  label?: string;
}

export function RangeSlider({ min, max, value, onChange, label }: RangeSliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const calculatePercentage = (val: number) => {
    return ((val - min) / (max - min)) * 100;
  };

  const handleDrag = (e: React.MouseEvent, thumbIndex: 0 | 1) => {
    e.preventDefault();
    if (!trackRef.current) return;

    const track = trackRef.current;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rect = track.getBoundingClientRect();
      const clickX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      const rawVal = Math.round(min + (percentage / 100) * (max - min));

      const nextVal = [...value] as [number, number];
      if (thumbIndex === 0) {
        nextVal[0] = Math.min(rawVal, value[1] - 1);
      } else {
        nextVal[1] = Math.max(rawVal, value[0] + 1);
      }
      onChange(nextVal);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const leftPercent = calculatePercentage(value[0]);
  const rightPercent = calculatePercentage(value[1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }} className="label">
          <span>{label}</span>
          <span>
            {value[0]} - {value[1]}
          </span>
        </div>
      )}
      <div
        ref={trackRef}
        style={{
          height: '6px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--border)',
          position: 'relative',
          width: '100%',
          marginTop: '6px',
          marginBottom: '6px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${leftPercent}%`,
            right: `${100 - rightPercent}%`,
            top: 0,
            bottom: 0,
            backgroundColor: 'var(--accent-solid)',
            borderRadius: 'var(--radius-full)',
          }}
        />
        {/* Left Thumb */}
        <div
          className="clickable"
          onMouseDown={(e) => handleDrag(e, 0)}
          style={{
            position: 'absolute',
            left: `${leftPercent}%`,
            transform: 'translateX(-50%)',
            top: '-5px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '2px solid var(--accent-solid)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
        {/* Right Thumb */}
        <div
          className="clickable"
          onMouseDown={(e) => handleDrag(e, 1)}
          style={{
            position: 'absolute',
            left: `${rightPercent}%`,
            transform: 'translateX(-50%)',
            top: '-5px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '2px solid var(--accent-solid)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
      </div>
    </div>
  );
}
