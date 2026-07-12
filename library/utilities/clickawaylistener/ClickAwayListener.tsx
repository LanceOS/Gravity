import React from 'react';

type RefForwardingChild = React.ReactElement<React.RefAttributes<Element>>;

export interface ClickAwayListenerProps {
  children: React.ReactElement;
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

export const ClickAwayListener = React.forwardRef<Element, ClickAwayListenerProps>(function ClickAwayListener(
  { children, onClickAway, active = true },
  forwardedRef,
) {
  // Keep the established broad child contract while limiting the clone boundary
  // to the optional ref shape it needs to compose.
  const child = children as RefForwardingChild;
  const childRef = React.useRef<Element | null>(null);

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
    (node: Element | null) => {
      childRef.current = node;

      if (node === null) {
        assignRef(child.props.ref, node);
        assignRef(forwardedRef, node);
        return;
      }

      const childRefCleanup = assignRef(child.props.ref, node);
      const forwardedRefCleanup = assignRef(forwardedRef, node);

      return () => {
        childRef.current = null;

        if (childRefCleanup) {
          childRefCleanup();
        } else {
          assignRef(child.props.ref, null);
        }

        if (forwardedRefCleanup) {
          forwardedRefCleanup();
        } else {
          assignRef(forwardedRef, null);
        }
      };
    },
    [child.props.ref, forwardedRef],
  );

  return React.cloneElement(child, {
    ref: setChildRef,
  });
});

ClickAwayListener.displayName = 'ClickAwayListener';
