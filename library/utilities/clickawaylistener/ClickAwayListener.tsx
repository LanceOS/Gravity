import React from 'react';

type RefForwardingChild = React.ReactElement<React.RefAttributes<HTMLElement>>;

export interface ClickAwayListenerProps {
  children: RefForwardingChild;
  onClickAway: (event: MouseEvent | TouchEvent) => void;
  active?: boolean;
}

function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(node);
    return typeof cleanup === 'function' ? () => cleanup() : undefined;
  } else if (ref) {
    ref.current = node;
  }

  return undefined;
}

export const ClickAwayListener = React.forwardRef<HTMLElement, ClickAwayListenerProps>(function ClickAwayListener(
  { children, onClickAway, active = true },
  forwardedRef,
) {
  const childRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) return;

    const handleInteraction = (event: MouseEvent | TouchEvent) => {
      const { target } = event;

      if (!(target instanceof Node)) {
        return;
      }

      if (target instanceof Element) {
        // Keep clicks inside the dropdown surface itself from dismissing it.
        // Dialogs elsewhere on the page should still count as outside clicks.
        if (target.closest('[role="listbox"], [role="menu"], [role="tooltip"], .select-menu, .autocomplete-menu, .popover-content')) {
          return;
        }
      }

      if (childRef.current && !childRef.current.contains(target)) {
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

  const setChildRef = React.useCallback(
    (node: HTMLElement | null) => {
      childRef.current = node;

      if (node === null) {
        assignRef(children.props.ref, node);
        assignRef(forwardedRef, node);
        return;
      }

      const childRefCleanup = assignRef(children.props.ref, node);
      const forwardedRefCleanup = assignRef(forwardedRef, node);

      return () => {
        childRef.current = null;

        if (childRefCleanup) {
          childRefCleanup();
        } else {
          assignRef(children.props.ref, null);
        }

        if (forwardedRefCleanup) {
          forwardedRefCleanup();
        } else {
          assignRef(forwardedRef, null);
        }
      };
    },
    [children.props.ref, forwardedRef],
  );

  return React.cloneElement(children, {
    ref: setChildRef,
  });
});

ClickAwayListener.displayName = 'ClickAwayListener';
