import type { CSSProperties } from 'react';
import type { SidebarActiveArea } from '../types';


export const countBadgeStyle = (): CSSProperties => ({
  marginLeft: 'auto',
  fontSize: '10px',
  color: 'var(--color-text-disabled)',
  background: 'rgba(255,255,255,0.03)',
  padding: '1px 5px',
  borderRadius: '4px',
});

export const agentButtonStyle = (extras: CSSProperties = {}): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 500,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-primary)',
  textAlign: 'left',
  cursor: 'pointer',
  ...extras,
});

export const dropdownItemStyle = (active: SidebarActiveArea | undefined, area?: SidebarActiveArea): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  color: area && active === area ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
  background: area && active === area ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
  border: area && active === area ? '1px solid rgba(59, 130, 246, 0.18)' : '1px solid transparent',
});