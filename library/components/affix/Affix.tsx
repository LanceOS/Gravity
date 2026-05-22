import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface AffixProps {
  offsetTop?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Affix({ offsetTop = 0, children, style }: AffixProps) {
  return (
    <div
      style={{
        position: 'sticky',
        top: `${offsetTop}px`,
        zIndex: 100,
        backgroundColor: 'var(--card-bg)',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
