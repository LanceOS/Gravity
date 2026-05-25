import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';
import { cn } from '../../utilities';

export interface ListItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function ListItem({ children, icon, onClick, selected = false, style, className = '' }: ListItemProps) {
  return (
    <li
      onClick={onClick}
      className={cn('lib-list-item', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        cursor: onClick ? 'pointer' : 'default',
        backgroundColor: selected ? 'var(--accent-dim)' : 'transparent',
        color: selected ? 'var(--color-primary)' : 'var(--color-text-primary)',
        transition: 'background-color var(--transition-fast), color var(--transition-fast)',
        userSelect: 'none',
        ...style
      }}
    >
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      <div style={{ flexGrow: 1, minWidth: 0 }}>{children}</div>
    </li>
  );
}
