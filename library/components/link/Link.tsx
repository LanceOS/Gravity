import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';
import { cn } from '../../utilities';

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
}

export function Link({ children, className = '', style, ...props }: LinkProps) {
  return (
    <a
      className={cn('clickable', className)}
      style={{
        color: 'var(--color-primary)',
        textDecoration: 'none',
        transition: 'color var(--transition-fast)',
        ...style,
      }}
      {...props}
    >
      {children}
    </a>
  );
}
