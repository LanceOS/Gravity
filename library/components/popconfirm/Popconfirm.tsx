import React from 'react';
import { DisclosureTrigger, dismissDisclosureOnEscape } from '../../utilities/disclosureTrigger';
import { ClickAwayListener } from '../../utilities';

export interface PopconfirmProps {
  title: string;
  onConfirm: () => void;
  children: React.ReactElement;
  /** Compose a custom button component that forwards button props to its DOM button. */
  triggerAsChild?: boolean;
  style?: React.CSSProperties;
}

export const Popconfirm = React.forwardRef<HTMLDivElement, PopconfirmProps>(function Popconfirm(
  { title, onConfirm, children, style, triggerAsChild },
  ref,
) {
  const [isOpen, setIsOpen] = React.useState(false);
  const contentId = React.useId();

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}
        onKeyDown={(event) => dismissDisclosureOnEscape(event, isOpen, () => setIsOpen(false))}>
        <DisclosureTrigger asChild={triggerAsChild} trigger={children} isOpen={isOpen} contentId={contentId}
          onToggle={() => setIsOpen((open) => !open)} />
        {isOpen && (
          <div
            id={contentId}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--surface-glass-strong)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
              WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
              padding: '10px 12px',
              zIndex: 1000,
              minWidth: '160px',
              marginBottom: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              ...style,
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{title}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-sm clickable"
                style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '11px' }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  setIsOpen(false);
                }}
                className="btn btn-sm btn-primary clickable"
                style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '11px' }}
              >
                Yes
              </button>
            </div>
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
});

Popconfirm.displayName = 'Popconfirm';
