import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { FocusTrap } from '../utilities/FocusTrap';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface CircularSpinnerProps {
  size?: number;
  style?: React.CSSProperties;
}

export function CircularSpinner({ size = 20, style }: CircularSpinnerProps) {
  return (
    <svg
      className="lib-spinner"
      viewBox="0 0 50 50"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...style,
      }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="var(--accent-solid)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="80px, 200px"
      />
    </svg>
  );
}
