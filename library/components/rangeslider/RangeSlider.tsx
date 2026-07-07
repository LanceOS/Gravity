import React from 'react';

export interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (val: [number, number]) => void;
  label?: string;
}

export function RangeSlider({ min, max, value, onChange, label }: RangeSliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const activeThumbRef = React.useRef<0 | 1 | null>(null);
  const latestValueRef = React.useRef(value);
  const latestMinRef = React.useRef(min);
  const latestMaxRef = React.useRef(max);
  const latestOnChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    latestValueRef.current = value;
    latestMinRef.current = min;
    latestMaxRef.current = max;
    latestOnChangeRef.current = onChange;
  }, [value, min, max, onChange]);

  const handleMouseMove = React.useCallback((moveEvent: MouseEvent) => {
    if (activeThumbRef.current === null || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const clickX = moveEvent.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const rawVal = Math.round(
      latestMinRef.current + (percentage / 100) * (latestMaxRef.current - latestMinRef.current),
    );

    const nextVal = [...latestValueRef.current] as [number, number];
    if (activeThumbRef.current === 0) {
      nextVal[0] = Math.min(rawVal, latestValueRef.current[1] - 1);
    } else {
      nextVal[1] = Math.max(rawVal, latestValueRef.current[0] + 1);
    }
    latestOnChangeRef.current(nextVal);
  }, []);

  const stopDrag = React.useCallback(() => {
    if (activeThumbRef.current === null) return;
    activeThumbRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopDrag);
  }, [handleMouseMove]);

  React.useEffect(() => {
    return () => {
      stopDrag();
    };
  }, [stopDrag]);

  const calculatePercentage = React.useCallback((val: number) => {
    return ((val - min) / (max - min)) * 100;
  }, [min, max]);

  const handleDrag = (e: React.MouseEvent, thumbIndex: 0 | 1) => {
    e.preventDefault();
    if (activeThumbRef.current !== null) return;

    activeThumbRef.current = thumbIndex;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDrag);
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
          backgroundColor: 'var(--color-border-default)',
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
            backgroundColor: 'var(--color-primary)',
            borderRadius: 'var(--radius-full)',
          }}
        />
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
            backgroundColor: 'var(--color-surface-overlay)',
            border: '2px solid var(--color-primary)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
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
            backgroundColor: 'var(--color-surface-overlay)',
            border: '2px solid var(--color-primary)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
      </div>
    </div>
  );
}
