import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  style?: React.CSSProperties;
}

export function Breadcrumbs({ items, style }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '6px', ...style }}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {item.href && !isLast ? (
              <a href={item.href} style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {item.label}
              </a>
            ) : (
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: isLast ? 500 : 400,
                  color: isLast ? 'var(--text-heading)' : 'var(--text-muted)',
                }}
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
