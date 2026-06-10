import React from 'react';

interface ClickAwayListenerProps {
  children: React.ReactElement;
  onClickAway: (event: MouseEvent | TouchEvent) => void;
  active?: boolean;
}

export function ClickAwayListener({ children, onClickAway, active = true }: ClickAwayListenerProps) {
  const childRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) return;

    const handleInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Element;
      if (target && typeof target.closest === 'function') {
        if (target.closest('[role="listbox"], [role="dialog"], [role="menu"], [role="tooltip"], .select-menu, .autocomplete-menu')) {
          return;
        }
      }
      if (childRef.current && !childRef.current.contains(target as Node)) {
        onClickAway(event);
      }
    };

    document.addEventListener('mousedown', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);

    return () => {
      document.removeEventListener('mousedown', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, [onClickAway, active]);

  return React.cloneElement(children as React.ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      childRef.current = node;
      const { ref } = children as any;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
  });
}
