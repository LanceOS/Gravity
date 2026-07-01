import React from 'react';
import { ClickAwayListener } from '../../utilities';
import anime from 'animejs';

const DROPDOWN_DURATION = 130;
const DROPDOWN_EASING = 'cubic-bezier(0.2, 0, 0.38, 1)';

function shouldReduceMotion(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function DropdownMenu({ trigger, children }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [renderState, setRenderState] = React.useState({ shouldRender: false, isClosing: false });
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const reducedMotion = shouldReduceMotion();

    if (isOpen) {
      setRenderState({ shouldRender: true, isClosing: false });
      return;
    }

    if (!renderState.shouldRender) {
      return;
    }

    if (reducedMotion) {
      setRenderState({ shouldRender: false, isClosing: false });
      return;
    }

    setRenderState((previous) => ({ ...previous, isClosing: true }));
    if (menuRef.current) {
      menuRef.current.style.opacity = '1';
      menuRef.current.style.transform = 'translateY(0)';
      anime.remove(menuRef.current);
      anime({
        targets: menuRef.current,
        opacity: [1, 0],
        translateY: [0, -4],
        duration: DROPDOWN_DURATION,
        easing: DROPDOWN_EASING,
        complete: () => {
          setRenderState({ shouldRender: false, isClosing: false });
        },
      });
    } else {
      setRenderState({ shouldRender: false, isClosing: false });
    }
  }, [isOpen, renderState.shouldRender]);

  React.useEffect(() => {
    if (!renderState.shouldRender || isOpen || renderState.isClosing || shouldReduceMotion()) {
      return;
    }

    if (menuRef.current) {
      menuRef.current.style.opacity = '0';
      menuRef.current.style.transform = 'translateY(4px)';
      anime.remove(menuRef.current);
      anime({
        targets: menuRef.current,
        opacity: [0, 1],
        translateY: [4, 0],
        duration: DROPDOWN_DURATION,
        easing: DROPDOWN_EASING,
      });
    }
  }, [isOpen, renderState.shouldRender, renderState.isClosing]);

  React.useEffect(() => {
    return () => {
      if (menuRef.current) {
        anime.remove(menuRef.current);
      }
    };
  }, []);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div onClick={() => setIsOpen(!isOpen)} className="clickable" style={{ display: 'contents' }}>
          {trigger}
        </div>
        {renderState.shouldRender && (
          <div
            ref={menuRef}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '4px',
              minWidth: 'max-content',
              marginTop: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {children}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
