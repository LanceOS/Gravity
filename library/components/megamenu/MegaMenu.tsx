import React from 'react';
import { DisclosureTrigger, dismissDisclosureOnEscape } from '../../utilities/disclosureTrigger';
import { ClickAwayListener } from '../../utilities';
import { Link } from '../link';

export interface MegaMenuColumn {
  title: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}

export interface MegaMenuProps {
  trigger: React.ReactNode;
  /** Compose a custom button component that forwards button props to its DOM button. */
  triggerAsChild?: boolean;
  columns: MegaMenuColumn[];
}

export function MegaMenu({ trigger, triggerAsChild, columns }: MegaMenuProps) {
  const contentId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative' }}
        onKeyDown={(event) => dismissDisclosureOnEscape(event, isOpen, () => setIsOpen(false))}>
        <DisclosureTrigger asChild={triggerAsChild} trigger={trigger} isOpen={isOpen} contentId={contentId}
          onToggle={() => setIsOpen((open) => !open)} />
        {isOpen && (
          <div
            id={contentId}
            inert={!isOpen}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              backgroundColor: 'var(--surface-glass-strong)',
              border: '1px solid var(--border-glass)',
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
