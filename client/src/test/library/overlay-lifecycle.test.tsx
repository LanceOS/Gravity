import React, { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '@library/components/modal/Modal';
import { Drawer } from '@library/components/drawer/Drawer';

// Exercise the real delayed-unmount path without running an animation clock.
vi.mock('animejs', () => ({ default: Object.assign(vi.fn(), { remove: vi.fn() }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each([['Modal', Modal], ['Drawer', Drawer]] as const)('%s interrupted exits', (_name, Overlay) => {
  it('cancels the previous close deadline when reopened', () => {
    const { rerender, unmount } = render(<Overlay isOpen onClose={() => {}}>Content</Overlay>, { wrapper: StrictMode });
    act(() => vi.runOnlyPendingTimers());
    const original = screen.getByRole('dialog');
    rerender(<Overlay isOpen={false} onClose={() => {}}>Content</Overlay>);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(50));
    rerender(<Overlay isOpen onClose={() => {}}>Content</Overlay>);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('dialog')).toBe(original);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
  });

  it('cancels pending close work and releases the scroll lock on unmount', () => {
    const { rerender, unmount } = render(<Overlay isOpen onClose={() => {}}>Content</Overlay>, { wrapper: StrictMode });
    act(() => vi.runOnlyPendingTimers());
    rerender(<Overlay isOpen={false} onClose={() => {}}>Content</Overlay>);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
