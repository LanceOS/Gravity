import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '@library/components/tooltip/Tooltip';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  let rect = new DOMRect(200, 100, 80, 30);
  let width = 120;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'tooltip' ? width : 80;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(24);
  const view = render(<StrictMode><div data-testid="scroller"><Tooltip content="Helpful tip"><button>Trigger</button></Tooltip></div></StrictMode>);
  const trigger = screen.getByRole('button').parentElement!;
  const measure = vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => rect);
  fireEvent.mouseEnter(trigger);
  return { ...view, trigger, measure, tooltip: screen.getByRole('tooltip'),
    move: (next: DOMRect) => { rect = next; }, grow: () => { width = 200; } };
}

describe('Tooltip portal placement', () => {
  it('measures after the portal mounts and centers below the trigger in viewport coordinates', () => {
    const { tooltip } = setup();
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveStyle({ position: 'fixed', left: '180px', top: '136px' });
  });

  it('follows nested scrolling and window resizing, flips above, and clamps at horizontal edges', () => {
    const { tooltip, move } = setup();
    move(new DOMRect(2, 60, 80, 30));
    fireEvent.scroll(screen.getByTestId('scroller'));
    expect(tooltip).toHaveStyle({ left: '8px', top: '96px' });
    move(new DOMRect(window.innerWidth - 80, window.innerHeight - 30, 80, 30));
    fireEvent.resize(window);
    expect(tooltip).toHaveStyle({ left: `${window.innerWidth - 128}px`, top: `${window.innerHeight - 60}px` });
  });

  it('observes trigger and content size changes and releases subscriptions when closed', () => {
    let resize = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const { tooltip, trigger, measure, grow, unmount } = setup();
    expect(observe).toHaveBeenCalledWith(trigger);
    expect(observe).toHaveBeenCalledWith(tooltip);
    grow();
    act(() => resize());
    expect(tooltip).toHaveStyle({ left: '140px' });
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(disconnect).toHaveBeenCalled();
    measure.mockClear();
    fireEvent.scroll(window);
    fireEvent.resize(window);
    expect(measure).not.toHaveBeenCalled();
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '140px' });
    unmount();
    measure.mockClear();
    fireEvent.resize(window);
    expect(measure).not.toHaveBeenCalled();
  });

  it('remeasures changed content without ResizeObserver while preserving visual styles', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { rerender, grow, tooltip } = setup();
    grow();
    rerender(<StrictMode><div data-testid="scroller"><Tooltip content="A longer helpful tip" style={{ backgroundColor: 'red', left: 0, top: 0, position: 'absolute' }}><button>Trigger</button></Tooltip></div></StrictMode>);
    expect(tooltip).toHaveTextContent('A longer helpful tip');
    expect(tooltip).toHaveStyle({ backgroundColor: 'rgb(255, 0, 0)', position: 'fixed', left: '140px', top: '136px' });
  });

  it('tracks position-only layout changes and cancels the animation frame on unmount', () => {
    let nextFrame: FrameRequestCallback = () => {};
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame = callback;
      return 42;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const { move, tooltip, unmount } = setup();
    move(new DOMRect(300, 200, 80, 30));
    act(() => nextFrame(16));
    expect(tooltip).toHaveStyle({ left: '280px', top: '236px' });
    expect(request).toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it('keeps a multiline tooltip inside the viewport when neither side has enough room', () => {
    const { tooltip, move } = setup();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500);
    move(new DOMRect(200, 300, 80, 30));
    fireEvent.resize(window);
    expect(tooltip).toHaveStyle({ top: `${window.innerHeight - 508}px` });
  });
});
