import { useCallback, useMemo, useSyncExternalStore } from 'react';

export function useReducedMotion(): boolean {
  const mediaQuery = useMemo(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  ), []);
  const subscribe = useCallback((onChange: () => void) => {
    mediaQuery?.addEventListener('change', onChange);
    return () => mediaQuery?.removeEventListener('change', onChange);
  }, [mediaQuery]);
  const getSnapshot = useCallback(() => mediaQuery?.matches ?? true, [mediaQuery]);

  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
