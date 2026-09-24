import type { CSSProperties } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DenseVirtualList } from '@library/components/densevirtuallist';
import { ContextMenu } from '@library/components/contextmenu';

const items = Array.from({ length: 100 }, (_, index) => ({ id: index, label: `Row ${index}` }));
const renderRow = (item: typeof items[number], _index: number, style: CSSProperties) => (
  <div key={item.id} style={style}>{item.label}</div>
);

function list(nextItems = items, height = 200, rowHeight = 40) {
  return <DenseVirtualList items={nextItems} height={height} rowHeight={rowHeight} buffer={0} renderRow={renderRow} />;
}

function scrollTo(scrollTop: number) {
  fireEvent.scroll(screen.getByRole('grid'), { target: { scrollTop } });
  act(() => vi.advanceTimersToNextFrame());
}

describe('DenseVirtualList scroll position', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps rows at the current scroll position rendered when more items arrive', () => {
    const { rerender } = render(list(items.slice(0, 60)));
    scrollTo(2200);
    expect(screen.getByText('Row 55')).toBeInTheDocument();

    rerender(list());

    expect(screen.getByRole('grid').scrollTop).toBe(2200);
    expect(screen.getByText('Row 55')).toBeInTheDocument();
    expect(screen.getByText('Row 60')).toBeInTheDocument();
    expect(screen.queryByText('Row 0')).not.toBeInTheDocument();
  });

  it('keeps the viewport populated when the same number of items are refreshed', () => {
    const { rerender } = render(list());
    scrollTo(2000);

    rerender(list(items.map((item) => ({ ...item, label: `Updated ${item.label}` }))));

    expect(screen.getByText('Updated Row 50')).toBeInTheDocument();
    expect(screen.queryByText('Updated Row 0')).not.toBeInTheDocument();
  });

  it('recalculates the visible rows at the current offset when dimensions change', () => {
    const { rerender } = render(list());
    scrollTo(2000);

    rerender(list(items, 400, 80));

    expect(screen.getByRole('grid').scrollTop).toBe(2000);
    expect(screen.getByText('Row 25')).toBeInTheDocument();
    expect(screen.getByText('Row 30')).toBeInTheDocument();
    expect(screen.queryByText('Row 0')).not.toBeInTheDocument();
  });

  it('uses the browser scroll offset after a shorter list clamps it', () => {
    const { rerender } = render(list());
    scrollTo(3600);

    // JSDOM does not lay out content or clamp scrollTop when it shrinks.
    // Simulate the offset the browser exposes before its next scroll event.
    screen.getByRole('grid').scrollTop = 600;
    rerender(list(items.slice(0, 20)));

    expect(screen.getByText('Row 15')).toBeInTheDocument();
    expect(screen.getByText('Row 19')).toBeInTheDocument();
    expect(screen.queryByText('Row 0')).not.toBeInTheDocument();
  });

  it('does not apply an outdated scroll frame after row dimensions change', () => {
    const { rerender } = render(list());
    fireEvent.scroll(screen.getByRole('grid'), { target: { scrollTop: 2000 } });

    rerender(list(items, 200, 80));
    act(() => vi.advanceTimersToNextFrame());

    expect(screen.getByText('Row 25')).toBeInTheDocument();
    expect(screen.queryByText('Row 50')).not.toBeInTheDocument();
  });
});

describe('DenseVirtualList interaction retention', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const getKey = (item: typeof items[number]) => item.id;
  const renderButton = (item: typeof items[number], _index: number, style: CSSProperties) => (
    <div style={style}><button>{item.label}</button></div>
  );
  const interactive = (nextItems = items) => <DenseVirtualList items={nextItems} height={200} rowHeight={40}
    buffer={0} getItemKey={getKey} itemFocusSelector="button" renderRow={renderButton} />;

  it('retains the same focused DOM node outside the window and across reordering', () => {
    const { rerender } = render(interactive());
    const focused = screen.getByRole('button', { name: 'Row 0' });
    act(() => focused.focus());
    scrollTo(2000);
    expect(focused).toHaveFocus();
    expect(screen.getAllByRole('button').length).toBeLessThan(10);
    rerender(interactive([...items.slice(1), items[0]]));
    expect(screen.getByRole('button', { name: 'Row 0' })).toBe(focused);
    expect(focused).toHaveFocus();
  });

  it('releases retained rows after focus leaves the list', async () => {
    render(<>{interactive()}<button>Outside</button></>);
    act(() => screen.getByRole('button', { name: 'Row 0' }).focus());
    scrollTo(2000);
    await act(async () => { screen.getByRole('button', { name: 'Outside' }).focus(); });
    expect(screen.queryByRole('button', { name: 'Row 0' })).not.toBeInTheDocument();
  });

  it('retains an offscreen row while its portaled menu owns focus and restores the trigger on Escape', async () => {
    render(<><DenseVirtualList items={items} height={200} rowHeight={40} buffer={0} getItemKey={getKey}
      itemFocusSelector="button" renderRow={(item, _index, style) => <div style={style}>
        <ContextMenu.Root items={[{ label: 'Change status', onClick: vi.fn() }]}>
          <button>{item.label}</button>
        </ContextMenu.Root>
      </div>} /><button>Outside</button></>);
    const trigger = screen.getByRole('button', { name: 'Row 0' });
    act(() => trigger.focus());
    scrollTo(2000);
    await act(async () => { fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true }); });
    expect(screen.getByRole('menuitem', { name: 'Change status' })).toHaveFocus();
    expect(trigger).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeLessThan(12);
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await act(async () => { screen.getByRole('button', { name: 'Outside' }).focus(); });
    expect(screen.queryByRole('button', { name: 'Row 0' })).not.toBeInTheDocument();
  });

  it('moves focus across virtual boundaries and skips non-interactive group headers', () => {
    render(<DenseVirtualList items={items} height={200} rowHeight={40} buffer={0} getItemKey={getKey}
      itemFocusSelector="button" isItemFocusable={item => item.id !== 6} renderRow={renderButton} />);
    act(() => screen.getByRole('button', { name: 'Row 5' }).focus());
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Row 7' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Row 99' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Row 98' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('button', { name: 'Row 0' })).toHaveFocus();
  });

  it('retains a dragged source until a drop outside the list completes', () => {
    render(interactive());
    fireEvent.dragStart(screen.getByRole('button', { name: 'Row 0' }));
    scrollTo(2000);
    expect(screen.getByRole('button', { name: 'Row 0' })).toBeInTheDocument();
    fireEvent.drop(document.body);
    expect(screen.queryByRole('button', { name: 'Row 0' })).not.toBeInTheDocument();
  });

  it('keeps a focus destination when filtering removes the active row', () => {
    const { rerender } = render(interactive());
    act(() => screen.getByRole('button', { name: 'Row 0' }).focus());
    rerender(interactive(items.slice(1)));
    expect(screen.getByRole('grid')).toHaveFocus();
  });
});
