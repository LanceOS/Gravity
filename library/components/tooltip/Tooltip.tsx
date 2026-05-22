import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Tooltip({ content, children, style }: TooltipProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <Portal>
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              backgroundColor: 'var(--text-heading)',
              color: 'var(--bg)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              zIndex: 9999,
              boxShadow: 'var(--shadow-sm)',
              pointerEvents: 'none',
              ...style,
            }}
            className="lib-animate-fade-in"
          >
            {content}
          </div>
        </Portal>
      )}
    </div>
  );
}
