import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface ListProps {
  children: React.ReactNode;
  ordered?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function List({ children, ordered = false, style, className = '' }: ListProps) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn('lib-list', className)}
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        ...style
      }}
    >
      {children}
    </Tag>
  );
}
