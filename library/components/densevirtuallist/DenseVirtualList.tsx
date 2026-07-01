import React from 'react';

export interface DenseVirtualListProps<T> {
  items: T[];
  height: number;
  rowHeight: number | ((item: T, index: number) => number);
  buffer?: number;
  renderRow: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  containerStyle?: React.CSSProperties;
}

function resolveRowHeight<T>(item: T, index: number, rowHeight: number | ((item: T, index: number) => number)): number {
  if (typeof rowHeight === 'function') {
    return Math.max(1, rowHeight(item, index));
  }

  return rowHeight;
}

function findFirstVisibleIndex(prefixHeights: number[], targetTop: number): number {
  const maxIndex = prefixHeights.length - 1;

  if (targetTop <= 0) {
    return 0;
  }

  let lower = 0;
  let upper = maxIndex;

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (prefixHeights[middle] <= targetTop) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  return Math.max(0, Math.min(maxIndex - 1, lower - 1));
}

export function DenseVirtualList<T>({
  items,
  height,
  rowHeight,
  buffer = 5,
  renderRow,
  containerStyle,
}: DenseVirtualListProps<T>) {
  const rowHeights = React.useMemo(
    () => items.map((item, index) => resolveRowHeight(item, index, rowHeight)),
    [items, rowHeight]
  );

  const prefixHeights = React.useMemo(() => {
    const totals = new Array(items.length + 1);
    totals[0] = 0;

    for (let index = 0; index < items.length; index += 1) {
      const previousHeight = totals[index] || 0;
      totals[index + 1] = previousHeight + rowHeights[index]!;
    }

    return totals;
  }, [items.length, rowHeights]);

  const maxRowHeight = React.useMemo(() => {
    if (rowHeights.length === 0) {
      return 1;
    }

    return rowHeights.reduce((acc, current) => Math.max(acc, current), 0);
  }, [rowHeights]);

  const getScrollRange = React.useCallback(
    (scrollTop: number) => {
      if (items.length === 0) {
        return { startIndex: 0, endIndex: -1 };
      }

      const visibleBufferPx = Math.max(0, buffer) * maxRowHeight;
      const bufferedTop = Math.max(0, scrollTop - visibleBufferPx);
      const bufferedBottom = scrollTop + height + visibleBufferPx;

      const startIndex = findFirstVisibleIndex(prefixHeights, bufferedTop);
      const endBoundary = findFirstVisibleIndex(prefixHeights, bufferedBottom);
      const endIndex = Math.min(items.length - 1, endBoundary);

      return { startIndex, endIndex };
    },
    [buffer, height, items.length, prefixHeights, maxRowHeight]
  );

  const [scrollRange, setScrollRange] = React.useState({
    startIndex: 0,
    endIndex: Math.max(-1, getScrollRange(0).endIndex),
  });

  React.useEffect(() => {
    setScrollRange(getScrollRange(0));
  }, [items.length, height, rowHeight, buffer, getScrollRange]);

  const rafIdRef = React.useRef<number | null>(null);
  const latestScrollTopRef = React.useRef(0);

  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    latestScrollTopRef.current = e.currentTarget.scrollTop;

    if (rafIdRef.current !== null) {
      return;
    }

    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      const nextRange = getScrollRange(latestScrollTopRef.current);

      setScrollRange((prev) => {
        if (prev.startIndex !== nextRange.startIndex || prev.endIndex !== nextRange.endIndex) {
          return nextRange;
        }
        return prev;
      });
    });
  }, [getScrollRange]);

  React.useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const totalHeight = prefixHeights[items.length] || 0;
  const { startIndex, endIndex } = scrollRange;

  const visibleItems = React.useMemo(() => {
    const renderedRange: React.ReactNode[] = [];

    if (startIndex > endIndex) {
      return renderedRange;
    }

    for (let index = startIndex; index <= endIndex; index += 1) {
      const item = items[index];
      if (!item) {
        continue;
      }

      const itemHeight = rowHeights[index] || 1;
      const style: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        transform: `translate3d(0, ${prefixHeights[index]}px, 0)`,
        left: 0,
        right: 0,
        height: `${itemHeight}px`,
        width: '100%',
        contain: 'layout style',
      };

      renderedRange.push(renderRow(item, index, style));
    }

    return renderedRange;
  }, [startIndex, endIndex, items, rowHeights, prefixHeights, renderRow]);

  return (
    <div
      onScroll={onScroll}
      style={{
        height: `${height}px`,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        outline: 'none',
        backgroundColor: 'transparent',
        borderRadius: 'var(--radius-sm)',
        contain: 'layout style',
        ...containerStyle,
      }}
      role="grid"
      aria-rowcount={items.length}
    >
      <div
        style={{
          height: `${totalHeight}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}
