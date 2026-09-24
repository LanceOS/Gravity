import React from 'react';

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
        backgroundColor: 'var(--surface-glass)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        borderBottom: '1px solid var(--border-subtle)',
        width: '100%',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)' }}>{brand}</div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>{children}</nav>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{actions}</div>}
    </header>
  );
}
