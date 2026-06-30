import type { CSSProperties } from 'react';
import type { SidebarActiveArea } from '../types';


export const countBadgeStyle = (): CSSProperties => ({
  marginLeft: 'auto',
  fontSize: '11px',
  color: 'var(--color-text-disabled)',
  background: 'var(--color-state-hover-overlay)',
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
  fontSize: '12px',
  fontWeight: 500,
  background: 'var(--color-state-hover-overlay)',
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
  fontSize: '13px',
  color: area && active === area ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
  background: area && active === area ? 'var(--color-state-selected-bg)' : 'transparent',
  border: area && active === area ? '1px solid var(--color-border-focus)' : '1px solid transparent',
});