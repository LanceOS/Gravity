import type { CSSProperties } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DenseVirtualList } from '@library/components/densevirtuallist';

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
