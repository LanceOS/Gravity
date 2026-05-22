import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
}

export function Link({ children, className = '', style, ...props }: LinkProps) {
  return (
    <a
      className={cn('clickable', className)}
      style={{
        color: 'var(--accent-solid)',
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
