import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface MegaMenuProps {
  trigger: React.ReactNode;
  columns: MegaMenuColumn[];
}

export function MegaMenu({ trigger, columns }: MegaMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative' }}>
        <div onClick={() => setIsOpen(!isOpen)} className="clickable" style={{ display: 'inline-block' }}>
          {trigger}
        </div>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: '20px',
              display: 'flex',
              gap: '24px',
              marginTop: '8px',
              minWidth: '460px',
            }}
          >
            {columns.map((col, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>
                  {col.title}
                </div>
                {col.links.map((link, lIdx) => (
                  <Link key={lIdx} href={link.href} style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
