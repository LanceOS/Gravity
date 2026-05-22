import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface NavbarProps {
  brand: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Navbar({ brand, actions, children, style }: NavbarProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        backgroundColor: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        width: '100%',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-heading)' }}>{brand}</div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>{children}</nav>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{actions}</div>}
    </header>
  );
}
