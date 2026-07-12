import React from 'react';
import { ClickAwayListener } from '../../utilities';

export interface PopconfirmProps {
  title: string;
  onConfirm: () => void;
  children: React.ReactElement<ClickableTriggerProps>;
  style?: React.CSSProperties;
}

interface ClickableTriggerProps {
  onClick?: React.MouseEventHandler<HTMLElement>;
}

export const Popconfirm = React.forwardRef<HTMLDivElement, PopconfirmProps>(function Popconfirm(
  { title, onConfirm, children, style },
  ref,
) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        {React.cloneElement(children, {
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            setIsOpen((wasOpen) => !wasOpen);
            children.props.onClick?.(event);
          },
        })}
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
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
