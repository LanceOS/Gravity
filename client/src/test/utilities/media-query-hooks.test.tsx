import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from '@library/utilities/useReducedMotion';
import { useIsMobileTicketLayout } from '../../modules/tickets/components/useMobileTicketLayout';

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(api: 'modern' | 'legacy', initialMatches = false) {
  const listeners = new Set<Listener>();
  const addListener = vi.fn((listener: Listener) => listeners.add(listener));
  const removeListener = vi.fn((listener: Listener) => listeners.delete(listener));
  const addEventListener = vi.fn((_type: string, listener: Listener) => listeners.add(listener));
  const removeEventListener = vi.fn((_type: string, listener: Listener) => listeners.delete(listener));
  const mediaQuery = {
    matches: initialMatches,
    addListener,
    removeListener,
    ...(api === 'modern' ? { addEventListener, removeEventListener } : {}),
  };

  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery as unknown as MediaQueryList);

  return {
    addListener,
    removeListener,
    addEventListener,
    removeEventListener,
    listenerCount: () => listeners.size,
    setMatches(matches: boolean) {
      mediaQuery.matches = matches;
      act(() => {
        for (const listener of listeners) {
          listener(mediaQuery as unknown as MediaQueryListEvent);
        }
      });
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('media query hooks', () => {
  it.each(['modern', 'legacy'] as const)('updates reduced motion and cleans up %s listeners', (api) => {
    const mediaQuery = mockMatchMedia(api);
    const { result, unmount } = renderHook(useReducedMotion);

    expect(result.current).toBe(false);
    expect(mediaQuery.listenerCount()).toBe(1);
    mediaQuery.setMatches(true);
    expect(result.current).toBe(true);
    mediaQuery.setMatches(false);
    expect(result.current).toBe(false);

    if (api === 'modern') {
      expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      unmount();
      expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
        'change', mediaQuery.addEventListener.mock.calls[0][1]
      );
      expect(mediaQuery.addListener).not.toHaveBeenCalled();
    } else {
      expect(mediaQuery.addListener).toHaveBeenCalledWith(expect.any(Function));
      unmount();
      expect(mediaQuery.removeListener).toHaveBeenCalledWith(mediaQuery.addListener.mock.calls[0][0]);
    }
    expect(mediaQuery.listenerCount()).toBe(0);
  });

  it.each(['modern', 'legacy'] as const)('updates mobile layout and cleans up %s listeners', (api) => {
    const mediaQuery = mockMatchMedia(api);
    const { result, unmount } = renderHook(useIsMobileTicketLayout);

    expect(result.current).toBe(false);
    expect(mediaQuery.listenerCount()).toBe(1);
    mediaQuery.setMatches(true);
    expect(result.current).toBe(true);
    mediaQuery.setMatches(false);
    expect(result.current).toBe(false);

    if (api === 'modern') {
      expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      unmount();
      expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
        'change', mediaQuery.addEventListener.mock.calls[0][1]
      );
      expect(mediaQuery.addListener).not.toHaveBeenCalled();
    } else {
      expect(mediaQuery.addListener).toHaveBeenCalledWith(expect.any(Function));
      unmount();
      expect(mediaQuery.removeListener).toHaveBeenCalledWith(mediaQuery.addListener.mock.calls[0][0]);
    }
    expect(mediaQuery.listenerCount()).toBe(0);
  });
});
