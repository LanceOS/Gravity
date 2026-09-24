import React from 'react';

interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
}

export function FocusTrap({ children, active = true }: FocusTrapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const getFocusableElements = () => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => {
        // Native controls can also opt out of the tab order. :disabled includes
        // disabled fieldsets, and inert applies to the whole ancestor subtree.
        if (el.tabIndex < 0 || el.matches(':disabled') || el.closest('[inert]')) return false;
        if (typeof el.checkVisibility === 'function') {
          return el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
        }
        // Older browsers (and DOM-only tests) lack checkVisibility. Checking
        // just the control's display misses a display:none ancestor.
        const visibility = window.getComputedStyle(el).visibility;
        if (visibility === 'hidden' || visibility === 'collapse') return false;
        for (let ancestor: HTMLElement | null = el; ancestor; ancestor = ancestor.parentElement) {
          const style = window.getComputedStyle(ancestor);
          if (style.display === 'none' || style.contentVisibility === 'hidden') return false;
        }
        return window.getComputedStyle(el).display !== 'contents';
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    };

    // Auto-focus first focusable element inside trap
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [active]);

  return <div ref={containerRef} style={{ display: 'contents' }}>{children}</div>;
}
