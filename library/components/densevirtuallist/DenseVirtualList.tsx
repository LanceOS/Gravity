import React from 'react';

export interface DenseVirtualListProps<T> {
  items: T[];
  height: number;
  rowHeight: number | ((item: T, index: number) => number);
  buffer?: number;
  renderRow: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  containerStyle?: React.CSSProperties;
  /** Stable identity retains focused and dragged rows outside the visible window. */
  getItemKey?: (item: T) => React.Key;
  /** Opt in to Arrow/Home/End and Tab navigation across virtual boundaries. */
  itemFocusSelector?: string;
  isItemFocusable?: (item: T) => boolean;
  /** Keep the same row tree for small lists while rendering every item. */
  virtualize?: boolean;
  /** Measure natural row content instead of imposing the estimated rowHeight. */
  measureRows?: boolean;
}

function MeasuredRow<T>({ children, rowKey, item, onMeasure }: {
  children: React.ReactNode;
  rowKey: React.Key;
  item: T;
  onMeasure: (key: React.Key, item: T, height: number, width: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0 && rect.width > 0) onMeasure(rowKey, item, rect.height, rect.width);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMeasure, rowKey, item]);
  return <div ref={ref} style={{ display: 'flow-root' }}>{children}</div>;
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
  getItemKey,
  itemFocusSelector,
  isItemFocusable,
  virtualize = true,
  measureRows = false,
}: DenseVirtualListProps<T>) {
  const [focusedKey, setFocusedKey] = React.useState<React.Key | null>(null);
  const [draggedKey, setDraggedKey] = React.useState<React.Key | null>(null);
  const pendingFocus = React.useRef<{ index: number; last: boolean } | null>(null);
  const keyboardFocusKey = React.useRef<React.Key | null>(null);
  const keyboardScrollTop = React.useRef(0);
  const keyIndexes = React.useMemo(() => new Map(items.map((item, index) => [getItemKey?.(item) ?? index, index])), [items, getItemKey]);
  const focusedIndex = focusedKey === null ? undefined : keyIndexes.get(focusedKey);
  const draggedIndex = draggedKey === null ? undefined : keyIndexes.get(draggedKey);
  const [measurements, setMeasurements] = React.useState<{ width: number; rows: Map<React.Key, { item: T; height: number }> }>(
    () => ({ width: 0, rows: new Map() })
  );
  const recordMeasurement = React.useCallback((key: React.Key, item: T, measuredHeight: number, width: number) => {
    setMeasurements(previous => {
      const cached = previous.rows.get(key);
      if (previous.width === width && cached?.item === item && cached.height === measuredHeight) return previous;
      // Width changes invalidate offscreen measurements too: labels may wrap differently.
      const rows = previous.width === width
        ? new Map([...previous.rows].filter(([key]) => keyIndexes.has(key))) : new Map();
      rows.set(key, { item, height: measuredHeight });
      return { width, rows };
    });
  }, [keyIndexes]);
  const rowHeights = React.useMemo(
    () => items.map((item, index) => {
      const cached = measureRows ? measurements.rows.get(getItemKey?.(item) ?? index) : undefined;
      return cached?.item === item ? cached.height : resolveRowHeight(item, index, rowHeight);
    }),
    [items, rowHeight, measureRows, measurements, getItemKey]
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
      if (!virtualize) return { startIndex: 0, endIndex: items.length - 1 };

      const visibleBufferPx = Math.max(0, buffer) * maxRowHeight;
      const bufferedTop = Math.max(0, scrollTop - visibleBufferPx);
      const bufferedBottom = scrollTop + height + visibleBufferPx;

      const startIndex = findFirstVisibleIndex(prefixHeights, bufferedTop);
      const endBoundary = findFirstVisibleIndex(prefixHeights, bufferedBottom);
      const endIndex = Math.min(items.length - 1, endBoundary);

      return { startIndex, endIndex };
    },
    [buffer, height, items.length, prefixHeights, maxRowHeight, virtualize]
  );

  const [scrollRange, setScrollRange] = React.useState({
    startIndex: 0,
    endIndex: Math.max(-1, getScrollRange(0).endIndex),
  });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const latestScrollTopRef = React.useRef(0);
  const focusWasInside = React.useRef(false);

  const rowFromTarget = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>('[data-virtual-index]') : null;
  const keyFromTarget = (target: EventTarget | null) => {
    const row = rowFromTarget(target);
    const index = row ? Number(row.dataset.virtualIndex) : -1;
    return items[index] ? getItemKey?.(items[index]) ?? index : null;
  };
  const tabbables = (row: Element) => Array.from(row.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
  ));

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!itemFocusSelector || event.altKey || event.ctrlKey || event.metaKey) return;
    const row = rowFromTarget(event.target);
    if (!row) return;
    const current = Number(row.dataset.virtualIndex);
    const backwards = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) || event.key === 'Home';
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(event.key)) return;
    if (event.key === 'Tab') {
      const controls = tabbables(row);
      if (event.target !== (backwards ? controls[0] : controls.at(-1))) return;
    } else if (!(event.target instanceof Element) || !event.target.matches(itemFocusSelector)) return;
    const step = backwards ? -1 : 1;
    let index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : current + step;
    while (index >= 0 && index < items.length && isItemFocusable && !isItemFocusable(items[index])) {
      index += event.key === 'Home' ? 1 : event.key === 'End' ? -1 : step;
    }
    if (index < 0 || index >= items.length) return; // Let Tab leave the list.
    event.preventDefault();
    pendingFocus.current = { index, last: event.key === 'Tab' && backwards };
    keyboardFocusKey.current = getItemKey?.(items[index]) ?? index;
    setFocusedKey(getItemKey?.(items[index]) ?? index);
    const container = containerRef.current;
    if (container) {
      const top = prefixHeights[index];
      const bottom = prefixHeights[index + 1];
      if (top < container.scrollTop) container.scrollTop = top;
      else if (bottom > container.scrollTop + height) container.scrollTop = bottom - height;
      keyboardScrollTop.current = container.scrollTop;
      setScrollRange(getScrollRange(container.scrollTop));
    }
  };

  React.useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (pending) {
      const row = containerRef.current?.querySelector(`[data-virtual-index="${pending.index}"]`);
      const target = row && (pending.last ? tabbables(row).at(-1) : row.querySelector<HTMLElement>(itemFocusSelector!));
      target?.focus({ preventScroll: true });
      pendingFocus.current = null;
    } else if (focusedKey !== null && focusedIndex === undefined) {
      // Filtering/deleting the focused item must not silently send focus to body.
      if (focusWasInside.current && document.activeElement === document.body) containerRef.current?.focus({ preventScroll: true });
    } else if (focusedIndex !== undefined && itemFocusSelector && focusWasInside.current && document.activeElement === document.body) {
      // Responsive row variants can replace the control while keeping its item.
      containerRef.current?.querySelector(`[data-virtual-index="${focusedIndex}"]`)
        ?.querySelector<HTMLElement>(itemFocusSelector)?.focus({ preventScroll: true });
    }
    // Jumping to an unmeasured row (e.g. End) first uses estimated offsets.
    // Keep the keyboard target visible as its newly mounted neighbours report
    // their real sizes. Pointer/touch scrolling cancels this reveal intent.
    const container = containerRef.current;
    const active = document.activeElement;
    if (measureRows && focusedKey !== null && keyboardFocusKey.current === focusedKey
      && container && active instanceof HTMLElement && container.contains(active)) {
      const viewport = container.getBoundingClientRect();
      const control = active.getBoundingClientRect();
      const adjustment = control.top < viewport.top ? control.top - viewport.top
        : control.bottom > viewport.bottom ? Math.min(control.top - viewport.top, control.bottom - viewport.bottom) : 0;
      if (adjustment) container.scrollTop += adjustment;
      keyboardScrollTop.current = container.scrollTop;
    }
  });

  React.useLayoutEffect(() => {
    // A queued scroll frame still uses the previous item sizes and count.
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Keep rendered rows aligned with the viewport when pages or sizes change.
    // Reading the DOM also accounts for the browser clamping a shorter list.
    latestScrollTopRef.current = containerRef.current?.scrollTop ?? 0;
    const nextRange = getScrollRange(latestScrollTopRef.current);
    setScrollRange((previous) => (
      previous.startIndex === nextRange.startIndex && previous.endIndex === nextRange.endIndex
        ? previous
        : nextRange
    ));
  }, [getScrollRange]);

  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop !== keyboardScrollTop.current) keyboardFocusKey.current = null;
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
    if (draggedKey === null) return;
    const clearDrag = () => setDraggedKey(null);
    document.addEventListener('dragend', clearDrag);
    document.addEventListener('drop', clearDrag);
    return () => {
      document.removeEventListener('dragend', clearDrag);
      document.removeEventListener('drop', clearDrag);
    };
  }, [draggedKey]);

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

    const indexes = new Set<number>();
    for (let index = startIndex; index <= endIndex; index += 1) indexes.add(index);
    if (focusedIndex !== undefined) indexes.add(focusedIndex);
    if (draggedIndex !== undefined) indexes.add(draggedIndex);
    for (const index of [...indexes].sort((a, b) => a - b)) {
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

      const key = getItemKey?.(item) ?? index;
      const rendered = renderRow(item, index, measureRows ? { width: '100%' } : style);
      renderedRange.push(getItemKey || itemFocusSelector || measureRows ? (
        <div key={key} data-virtual-index={index} style={measureRows ? { ...style, height: 'auto' } : { display: 'contents' }}
          onFocusCapture={() => {
            focusWasInside.current = true;
            if (keyboardFocusKey.current !== key) keyboardFocusKey.current = null;
            setFocusedKey(key);
          }}>
          {measureRows ? <MeasuredRow rowKey={key} item={item} onMeasure={recordMeasurement}>{rendered}</MeasuredRow> : rendered}
        </div>
      ) : rendered);
    }

    return renderedRange;
  }, [startIndex, endIndex, items, rowHeights, prefixHeights, renderRow, focusedIndex, draggedIndex, getItemKey, itemFocusSelector, measureRows, recordMeasurement]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onWheelCapture={() => { keyboardFocusKey.current = null; }}
      onPointerDownCapture={() => { keyboardFocusKey.current = null; }}
      onTouchMoveCapture={() => { keyboardFocusKey.current = null; }}
      onFocusCapture={(event) => {
        focusWasInside.current = true;
        if (event.target === event.currentTarget) setFocusedKey(null);
      }}
      onBlurCapture={() => {
        focusWasInside.current = false;
        // React focus events follow row ownership through portals. Wait for the
        // next focus event before deciding whether focus actually left the row tree.
        queueMicrotask(() => { if (!focusWasInside.current) setFocusedKey(null); });
      }}
      onDragStartCapture={(event) => setDraggedKey(keyFromTarget(event.target))}
      onDragEndCapture={() => setDraggedKey(null)}
      style={{
        height: `${height}px`,
        flexShrink: 0,
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
