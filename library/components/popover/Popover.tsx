import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';
import './Popover.css';

export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: React.CSSProperties;
  align?: 'left' | 'right' | 'center';
  contentClassName?: string;
}

export function Popover({ trigger, children, isOpen: controlledIsOpen, onOpenChange, style, align = 'left', contentClassName = '' }: PopoverProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(false);
  const isCurrentlyOpen = controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;
  const popoverRef = React.useRef<HTMLDivElement>(null);
  
  const [renderState, setRenderState] = React.useState({
    isOpen: isCurrentlyOpen,
    shouldRender: isCurrentlyOpen,
    isAnimatingOut: false,
  });

  if (isCurrentlyOpen !== renderState.isOpen) {
    setRenderState({
      isOpen: isCurrentlyOpen,
      shouldRender: isCurrentlyOpen ? true : renderState.shouldRender,
      isAnimatingOut: !isCurrentlyOpen,
    });
  }

  const { shouldRender, isAnimatingOut } = renderState;

  const setOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setUncontrolledIsOpen(open);
    }
  };

  const handleAnimationEnd = () => {
    if (!isCurrentlyOpen) {
      setRenderState((prev) => ({
        ...prev,
        shouldRender: false,
        isAnimatingOut: false,
      }));
    }
  };

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block', ...style }}>
        <div
          onClick={() => setOpen(!isCurrentlyOpen)}
          className="clickable"
          style={{ display: 'contents' }}
        >
          {trigger}
        </div>
        {shouldRender && (
          <div
            ref={popoverRef}
            role="dialog"
            onAnimationEnd={handleAnimationEnd}
            className={`popover-content popover-content--align-${align} ${isAnimatingOut ? 'lib-animate-fade-out-up' : 'lib-animate-fade-in-down'} ${contentClassName}`}
          >
            {children}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
