import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface SidebarProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Sidebar({ children, style }: SidebarProps) {
  return (
    <aside
      style={{
        width: '240px',
        height: '100%',
        backgroundColor: 'var(--color-base50)',
        borderRight: '1px solid var(--color-border-default)',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </aside>
  );
}
