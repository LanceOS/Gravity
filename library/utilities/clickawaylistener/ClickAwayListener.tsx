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
        // Keep clicks inside the dropdown surface itself from dismissing it.
        // Dialogs elsewhere on the page should still count as outside clicks.
        if (target.closest('[role="listbox"], [role="menu"], [role="tooltip"], .select-menu, .autocomplete-menu, .popover-content')) {
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
      const childRefProp = (children.props as { ref?: React.Ref<HTMLElement> }).ref;

      if (typeof childRefProp === 'function') {
        childRefProp(node);
      } else if (childRefProp && typeof childRefProp === 'object' && 'current' in childRefProp) {
        childRefProp.current = node;
      }
    },
  });
}
