import type { CSSProperties } from 'react';
import type { SidebarActiveArea } from '../types';

export const sidebarShellStyle: CSSProperties = {
  width: '240px',
  background: 'var(--color-base50)',
  borderRight: '1px solid var(--color-border-default)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  flexShrink: 0,
};

export const scrollAreaStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 8px',
};

export const menuItemStyle = (isActive: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 10px',
  borderRadius: '6px',
  fontSize: '13px',
  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
  background: isActive ? 'var(--color-border-default)' : 'transparent',
  fontWeight: isActive ? 500 : 400,
  cursor: 'pointer',
});

export const nestedMenuItemStyle = (isActive: boolean): CSSProperties => ({
  ...menuItemStyle(isActive),
  fontSize: '12px',
  padding: '5px 8px',
});

export const sectionLabelStyle: CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--color-text-disabled)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '4px 8px 0 8px',
};

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