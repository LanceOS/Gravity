import React from 'react';

type RefForwardingChild = React.ReactElement<React.RefAttributes<Element>>;

export interface ClickAwayListenerProps {
  children: React.ReactElement;
  onClickAway: (event: PointerEvent | MouseEvent | TouchEvent) => void;
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

    const handleInteraction = (event: PointerEvent | MouseEvent | TouchEvent) => {
      const { target } = event;

      if (!(target instanceof Node)) {
        return false;
      }

      if (target instanceof Element) {
        // Keep clicks inside the dropdown surface itself from dismissing it.
        // Dialogs elsewhere on the page should still count as outside clicks.
        if (target.closest('[role="listbox"], [role="menu"], [role="tooltip"], .select-menu, .autocomplete-menu, .popover-content')) {
          return false;
        }
      }

      if (childRef.current && !childRef.current.contains(target)) {
        onClickAway(event);
        return true;
      }

      return false;
    };

    if (typeof window.PointerEvent === 'function') {
      document.addEventListener('pointerdown', handleInteraction);

      return () => {
        document.removeEventListener('pointerdown', handleInteraction);
      };
    }

    // Older browsers can dispatch a compatibility mousedown after touchstart.
    // Keep both fallbacks but avoid dismissing twice for that one touch.
    let lastTouchStartTime: number | undefined;
    const handleTouchStart = (event: TouchEvent) => {
      if (handleInteraction(event)) {
        lastTouchStartTime = event.timeStamp;
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (lastTouchStartTime !== undefined) {
        const elapsed = event.timeStamp - lastTouchStartTime;
        if (elapsed >= 0 && elapsed < 800) {
          return;
        }
      }

      handleInteraction(event);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('touchstart', handleTouchStart);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, [onClickAway, active]);

  const setChildRef = React.useCallback(
    (node: Element | null) => {
      // React 19 always detaches via the cleanup function returned below, so this
      // callback is only ever invoked with a non-null node.
      if (node === null) {
        return;
      }

      childRef.current = node;

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
